//! Itera bounty escrow.
//!
//! One program-derived account per bounty holds the reward. Its address is
//! derived from the bounty id AND its terms (sponsor, approver, collection,
//! amount, expiry). The program, not the Itera server, decides where that
//! money can go:
//!
//! * `accept` records a claimant only if THE CLAIMANT SIGNED and the
//!   certification account passed in is a Metaplex Core asset owned by that
//!   claimant and belonging to the collection the bounty names. The program
//!   reads the asset account itself.
//!   A GATED bounty (`create_gated`, 228 bytes) also names a trail and a
//!   number of stamped days in its terms, and `accept` reads them from the
//!   asset: the soulbound freeze, the `program` and `trail` attributes and
//!   `days_done`. Nobody co-signs: the claimant's signature is the only one
//!   the program asks for.
//!   A bounty created with `create` (195 bytes) names no days: an attester
//!   co-signs its accept (the bounty's approver, or Itera's attester key)
//!   and vouches for what the program does not read there.
//! * `unclaim` reopens a held bounty. The claimant can always sign it (giving
//!   up needs nobody's permission); so can the approver and the attester.
//! * `release` pays the recorded claimant, once. Only the approver signs it.
//! * `refund` pays the sponsor recorded at creation, and only while nobody
//!   holds the bounty. Once the bounty is past its expiry anyone may send it:
//!   the destination is fixed.
//!
//! The approver (the sponsor's key) chooses WHEN the reward is paid. It cannot
//! choose a destination, pay an uncertified wallet, or pay twice. The attester
//! can never move the reward anywhere: it can only co-sign an accept or reopen
//! a claim.

use solana_program::{
    account_info::{next_account_info, AccountInfo},
    clock::Clock,
    entrypoint,
    hash::hashv,
    entrypoint::ProgramResult,
    program::invoke_signed,
    program_error::ProgramError,
    pubkey,
    pubkey::Pubkey,
    rent::Rent,
    system_instruction, system_program,
    sysvar::Sysvar,
};

solana_program::declare_id!("ETeJkm9QrVgMuaMdAV6aLkFZGLDX6pMcniAXu8rcBqhq");

/// Metaplex Core.
pub const MPL_CORE: Pubkey = pubkey!("CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d");
/// `Key::AssetV1`, the first byte of a Core asset account.
const CORE_ASSET_V1: u8 = 1;
/// `UpdateAuthority::Collection`, the tag that follows the owner in a Core asset account.
const CORE_UPDATE_AUTHORITY_COLLECTION: u8 = 2;

/// Itera's attester: may co-sign `accept` and sign `unclaim` on any bounty. It appears in no instruction that moves lamports
/// unless it is also that bounty's approver or sponsor.
pub const ITERA_ATTESTER: Pubkey = pubkey!("AMoTUQic1C5ecYfvs3T2L5cBAZcUmCn4dPvboSdmJ3cA");

/// The plugin header and registry that follow the asset in a Core account, and the two plugins read here.
const CORE_PLUGIN_HEADER_V1: u8 = 3;
const CORE_PLUGIN_REGISTRY_V1: u8 = 4;
const CORE_PLUGIN_PERMANENT_FREEZE_DELEGATE: u8 = 5;
const CORE_PLUGIN_ATTRIBUTES: u8 = 6;
/// `Authority::UpdateAuthority`: only the collection's authority can write the plugin.
const CORE_AUTHORITY_UPDATE_AUTHORITY: u8 = 2;
const CORE_AUTHORITY_ADDRESS: u8 = 3;

pub const SEED: &[u8] = b"bounty";
pub const STATE_LEN: usize = 195;
/// A gated bounty: the same 195 bytes, then `min_days` and the trail it asks for.
pub const GATED_STATE_LEN: usize = 228;
const TAG: u8 = 1;
const TAG_GATED: u8 = 2;

pub const OPEN: u8 = 0;
pub const CLAIMED: u8 = 1;
pub const PAID: u8 = 2;
pub const REFUNDED: u8 = 3;

const O_TAG: usize = 0;
const O_BUMP: usize = 1;
const O_STATUS: usize = 2;
const O_ID: usize = 3;
const O_SPONSOR: usize = 19;
const O_APPROVER: usize = 51;
const O_COLLECTION: usize = 83;
const O_AMOUNT: usize = 115;
const O_EXPIRES: usize = 123;
const O_CLAIMANT: usize = 131;
const O_CERT: usize = 163;
const O_MIN_DAYS: usize = 195;
const O_TRAIL: usize = 196;

#[repr(u32)]
pub enum EscrowError {
    WrongEscrowAccount = 6000,
    AlreadyExists = 6001,
    InvalidAmount = 6002,
    InvalidExpiry = 6003,
    NotApprover = 6004,
    NotOpen = 6005,
    NotClaimed = 6006,
    Expired = 6007,
    NotACertification = 6008,
    CertificationNotOwnedByClaimant = 6009,
    CertificationOfAnotherCollection = 6010,
    WrongClaimant = 6011,
    WrongSponsor = 6012,
    NotAuthorized = 6013,
    ClaimantMustSign = 6014,
    CertificationNotFrozen = 6015,
    CertificationWithoutStamps = 6016,
    CertificationOfAnotherTrail = 6017,
    NotEnoughStampedDays = 6018,
    InvalidRequirement = 6019,
}

impl From<EscrowError> for ProgramError {
    fn from(error: EscrowError) -> Self {
        ProgramError::Custom(error as u32)
    }
}

entrypoint!(process_instruction);

pub fn process_instruction(program_id: &Pubkey, accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
    let (instruction, rest) = data.split_first().ok_or(ProgramError::InvalidInstructionData)?;
    match instruction {
        0 => create(program_id, accounts, rest),
        1 => accept(program_id, accounts),
        2 => release(program_id, accounts),
        3 => unclaim(program_id, accounts),
        4 => refund(program_id, accounts),
        5 => create_gated(program_id, accounts, rest),
        _ => Err(ProgramError::InvalidInstructionData),
    }
}

fn key_at(data: &[u8], offset: usize) -> Pubkey {
    let mut bytes = [0u8; 32];
    bytes.copy_from_slice(&data[offset..offset + 32]);
    Pubkey::new_from_array(bytes)
}

fn u64_at(data: &[u8], offset: usize) -> u64 {
    let mut bytes = [0u8; 8];
    bytes.copy_from_slice(&data[offset..offset + 8]);
    u64::from_le_bytes(bytes)
}

/// The bounty account, checked to be ours.
fn check_bounty(program_id: &Pubkey, bounty: &AccountInfo) -> ProgramResult {
    if bounty.owner != program_id {
        return Err(EscrowError::WrongEscrowAccount.into());
    }
    let tag = bounty.try_borrow_data()?.first().copied();
    let known = (bounty.data_len() == STATE_LEN && tag == Some(TAG)) || (bounty.data_len() == GATED_STATE_LEN && tag == Some(TAG_GATED));
    if !known {
        return Err(EscrowError::WrongEscrowAccount.into());
    }
    Ok(())
}

/// The trail a gated bounty asks for: sha256 of the certification's `program` attribute, a line feed, its `trail` attribute.
pub fn trail_hash(program: &[u8], trail: &[u8]) -> [u8; 32] {
    hashv(&[program, b"\n", trail]).to_bytes()
}

fn take<'a>(data: &'a [u8], at: &mut usize, len: usize) -> Result<&'a [u8], ProgramError> {
    let end = at.checked_add(len).ok_or(EscrowError::NotACertification)?;
    let bytes = data.get(*at..end).ok_or(EscrowError::NotACertification)?;
    *at = end;
    Ok(bytes)
}

fn take_u32(data: &[u8], at: &mut usize) -> Result<usize, ProgramError> {
    let bytes = take(data, at, 4)?;
    Ok(u32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]) as usize)
}

fn take_u64(data: &[u8], at: &mut usize) -> Result<usize, ProgramError> {
    let bytes = take(data, at, 8)?;
    usize::try_from(u64_at(bytes, 0)).map_err(|_| EscrowError::NotACertification.into())
}

/// A borsh string: its bytes.
fn take_string<'a>(data: &'a [u8], at: &mut usize) -> Result<&'a [u8], ProgramError> {
    let len = take_u32(data, at)?;
    take(data, at, len)
}

/// What a gated bounty reads from a certification beyond its owner and collection.
#[derive(Debug, PartialEq, Eq)]
pub struct Stamps {
    /// The PermanentFreezeDelegate plugin says frozen: the certification cannot change wallets.
    pub frozen: bool,
    pub trail: [u8; 32],
    pub days_done: u64,
}

/// Decimal digits only, at most four: the value `days_done` is written with.
fn days_of(value: &[u8]) -> Option<u64> {
    if value.is_empty() || value.len() > 4 || !value.iter().all(u8::is_ascii_digit) {
        return None;
    }
    Some(value.iter().fold(0u64, |days, digit| days * 10 + u64::from(digit - b'0')))
}

/// Reads the plugins of a Core asset account (`AssetV1`, plugin header, plugin registry): the soulbound freeze and
/// the attributes `program`, `trail` and `days_done`. The attributes count only when the plugin is under the update
/// authority, which for a certification is its collection: the owner of the asset cannot write them.
pub fn read_stamps(asset: &[u8]) -> Result<Stamps, ProgramError> {
    let mut at = 1 + 32;
    let update_authority = take(asset, &mut at, 1)?[0];
    if update_authority != 0 {
        take(asset, &mut at, 32)?;
    }
    take_string(asset, &mut at)?;
    take_string(asset, &mut at)?;
    if take(asset, &mut at, 1)?[0] != 0 {
        take(asset, &mut at, 8)?;
    }
    if take(asset, &mut at, 1).map_err(|_| EscrowError::CertificationWithoutStamps)?[0] != CORE_PLUGIN_HEADER_V1 {
        return Err(EscrowError::CertificationWithoutStamps.into());
    }
    let mut at = take_u64(asset, &mut at)?;
    if take(asset, &mut at, 1)?[0] != CORE_PLUGIN_REGISTRY_V1 {
        return Err(EscrowError::CertificationWithoutStamps.into());
    }
    let mut frozen = false;
    let mut program: Option<&[u8]> = None;
    let mut trail: Option<&[u8]> = None;
    let mut days_done: Option<u64> = None;
    for _ in 0..take_u32(asset, &mut at)? {
        let plugin = take(asset, &mut at, 1)?[0];
        let authority = take(asset, &mut at, 1)?[0];
        if authority == CORE_AUTHORITY_ADDRESS {
            take(asset, &mut at, 32)?;
        }
        let mut body = take_u64(asset, &mut at)?;
        if plugin == CORE_PLUGIN_PERMANENT_FREEZE_DELEGATE {
            frozen = take(asset, &mut body, 2)? == [CORE_PLUGIN_PERMANENT_FREEZE_DELEGATE, 1];
        }
        if plugin == CORE_PLUGIN_ATTRIBUTES && authority == CORE_AUTHORITY_UPDATE_AUTHORITY {
            if take(asset, &mut body, 1)?[0] != CORE_PLUGIN_ATTRIBUTES {
                return Err(EscrowError::NotACertification.into());
            }
            for _ in 0..take_u32(asset, &mut body)? {
                let key = take_string(asset, &mut body)?;
                let value = take_string(asset, &mut body)?;
                match key {
                    b"program" => program = Some(value),
                    b"trail" => trail = Some(value),
                    b"days_done" => days_done = days_of(value),
                    _ => {}
                }
            }
        }
    }
    match (program, trail, days_done) {
        (Some(program), Some(trail), Some(days_done)) => Ok(Stamps { frozen, trail: trail_hash(program, trail), days_done }),
        _ => Err(EscrowError::CertificationWithoutStamps.into()),
    }
}

fn check_approver(bounty_data: &[u8], approver: &AccountInfo) -> ProgramResult {
    if !approver.is_signer || key_at(bounty_data, O_APPROVER) != *approver.key {
        return Err(EscrowError::NotApprover.into());
    }
    Ok(())
}

fn pay_out(bounty: &AccountInfo, destination: &AccountInfo, lamports: u64) -> ProgramResult {
    let left = bounty.lamports().checked_sub(lamports).ok_or(ProgramError::InsufficientFunds)?;
    let received = destination.lamports().checked_add(lamports).ok_or(ProgramError::ArithmeticOverflow)?;
    **bounty.try_borrow_mut_lamports()? = left;
    **destination.try_borrow_mut_lamports()? = received;
    Ok(())
}

/// data: id [16] | amount u64 LE | expires_at i64 LE
/// accounts: funder (signer, writable), bounty (writable), sponsor, approver, collection, system program
/// bounty = PDA of ["bounty", id, sponsor, approver, collection, amount LE, expires_at LE]
fn create(program_id: &Pubkey, accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
    if data.len() != 32 {
        return Err(ProgramError::InvalidInstructionData);
    }
    open_bounty(program_id, accounts, data, None)
}

/// data: id [16] | amount u64 LE | expires_at i64 LE | min_days u8 | trail [32]
/// accounts: the same as `create`
/// bounty = PDA of ["bounty", id, sponsor, approver, collection, amount LE, expires_at LE, min_days, trail]
/// `trail` = sha256(program attribute, "\n", trail attribute) of the certification the bounty asks for.
fn create_gated(program_id: &Pubkey, accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
    if data.len() != 65 {
        return Err(ProgramError::InvalidInstructionData);
    }
    if data[32] == 0 {
        return Err(EscrowError::InvalidRequirement.into());
    }
    open_bounty(program_id, accounts, &data[..32], Some(&data[32..65]))
}

fn open_bounty(program_id: &Pubkey, accounts: &[AccountInfo], data: &[u8], requirement: Option<&[u8]>) -> ProgramResult {
    let iter = &mut accounts.iter();
    let funder = next_account_info(iter)?;
    let bounty = next_account_info(iter)?;
    let sponsor = next_account_info(iter)?;
    let approver = next_account_info(iter)?;
    let collection = next_account_info(iter)?;
    let system = next_account_info(iter)?;

    let id = &data[0..16];
    let amount = u64_at(data, 16);
    let expires_at = i64::from_le_bytes(u64_at(data, 24).to_le_bytes());

    if !funder.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }
    if *system.key != system_program::ID {
        return Err(ProgramError::IncorrectProgramId);
    }
    // The address commits to every term. Whatever exists at a bounty's address was created with exactly the
    // terms it was posted with, so nobody can occupy it with other terms: creating it IS funding it.
    let mut seeds: Vec<&[u8]> = vec![SEED, id, sponsor.key.as_ref(), approver.key.as_ref(), collection.key.as_ref(), &data[16..24], &data[24..32]];
    if let Some(requirement) = requirement {
        seeds.push(&requirement[..1]);
        seeds.push(&requirement[1..]);
    }
    let (expected, bump) = Pubkey::find_program_address(&seeds, program_id);
    if expected != *bounty.key {
        return Err(EscrowError::WrongEscrowAccount.into());
    }
    if !bounty.data_is_empty() || *bounty.owner != system_program::ID {
        return Err(EscrowError::AlreadyExists.into());
    }
    if amount == 0 {
        return Err(EscrowError::InvalidAmount.into());
    }
    if expires_at <= Clock::get()?.unix_timestamp {
        return Err(EscrowError::InvalidExpiry.into());
    }

    let len = if requirement.is_some() { GATED_STATE_LEN } else { STATE_LEN };
    let lamports = Rent::get()?.minimum_balance(len).checked_add(amount).ok_or(ProgramError::ArithmeticOverflow)?;
    let bump_seed = [bump];
    seeds.push(&bump_seed);
    invoke_signed(
        &system_instruction::create_account(funder.key, bounty.key, lamports, len as u64, program_id),
        &[funder.clone(), bounty.clone(), system.clone()],
        &[seeds.as_slice()],
    )?;

    let mut state = bounty.try_borrow_mut_data()?;
    state[O_TAG] = if requirement.is_some() { TAG_GATED } else { TAG };
    state[O_BUMP] = bump;
    state[O_STATUS] = OPEN;
    state[O_ID..O_ID + 16].copy_from_slice(id);
    state[O_SPONSOR..O_SPONSOR + 32].copy_from_slice(sponsor.key.as_ref());
    state[O_APPROVER..O_APPROVER + 32].copy_from_slice(approver.key.as_ref());
    state[O_COLLECTION..O_COLLECTION + 32].copy_from_slice(collection.key.as_ref());
    state[O_AMOUNT..O_AMOUNT + 8].copy_from_slice(&amount.to_le_bytes());
    state[O_EXPIRES..O_EXPIRES + 8].copy_from_slice(&expires_at.to_le_bytes());
    if let Some(requirement) = requirement {
        state[O_MIN_DAYS..GATED_STATE_LEN].copy_from_slice(requirement);
    }
    Ok(())
}

/// accounts: attester, bounty (writable), claimant (signer), certification (the claimant's Core asset)
/// attester: on a 195-byte bounty a signer, the approver or ITERA_ATTESTER. On a gated bounty nobody: the account is not read.
fn accept(program_id: &Pubkey, accounts: &[AccountInfo]) -> ProgramResult {
    let iter = &mut accounts.iter();
    let attester = next_account_info(iter)?;
    let bounty = next_account_info(iter)?;
    let claimant = next_account_info(iter)?;
    let certification = next_account_info(iter)?;

    check_bounty(program_id, bounty)?;
    let mut state = bounty.try_borrow_mut_data()?;
    let gated = state[O_TAG] == TAG_GATED;
    if gated {
        // The terms name the days: the asset account answers below and nobody vouches for anything.
    } else if *attester.key == ITERA_ATTESTER {
        if !attester.is_signer {
            return Err(EscrowError::NotApprover.into());
        }
    } else {
        check_approver(&state, attester)?;
    }
    // Nobody can be recorded as holding a bounty without their own signature.
    if !claimant.is_signer {
        return Err(EscrowError::ClaimantMustSign.into());
    }
    if state[O_STATUS] != OPEN {
        return Err(EscrowError::NotOpen.into());
    }
    let expires_at = i64::from_le_bytes(u64_at(&state, O_EXPIRES).to_le_bytes());
    if Clock::get()?.unix_timestamp >= expires_at {
        return Err(EscrowError::Expired.into());
    }

    // The gate. Nothing here trusts the approver: the asset account says who owns it and which collection it is in.
    if *certification.owner != MPL_CORE {
        return Err(EscrowError::NotACertification.into());
    }
    let asset = certification.try_borrow_data()?;
    if asset.len() < 66 || asset[0] != CORE_ASSET_V1 {
        return Err(EscrowError::NotACertification.into());
    }
    if key_at(&asset, 1) != *claimant.key {
        return Err(EscrowError::CertificationNotOwnedByClaimant.into());
    }
    if asset[33] != CORE_UPDATE_AUTHORITY_COLLECTION || key_at(&asset, 34) != key_at(&state, O_COLLECTION) {
        return Err(EscrowError::CertificationOfAnotherCollection.into());
    }
    if gated {
        let stamps = read_stamps(&asset)?;
        if !stamps.frozen {
            return Err(EscrowError::CertificationNotFrozen.into());
        }
        if stamps.trail != state[O_TRAIL..GATED_STATE_LEN] {
            return Err(EscrowError::CertificationOfAnotherTrail.into());
        }
        if stamps.days_done < u64::from(state[O_MIN_DAYS]) {
            return Err(EscrowError::NotEnoughStampedDays.into());
        }
    }

    state[O_CLAIMANT..O_CLAIMANT + 32].copy_from_slice(claimant.key.as_ref());
    state[O_CERT..O_CERT + 32].copy_from_slice(certification.key.as_ref());
    state[O_STATUS] = CLAIMED;
    Ok(())
}

/// accounts: approver (signer), bounty (writable), claimant (writable)
fn release(program_id: &Pubkey, accounts: &[AccountInfo]) -> ProgramResult {
    let iter = &mut accounts.iter();
    let approver = next_account_info(iter)?;
    let bounty = next_account_info(iter)?;
    let claimant = next_account_info(iter)?;

    check_bounty(program_id, bounty)?;
    let amount = {
        let mut state = bounty.try_borrow_mut_data()?;
        check_approver(&state, approver)?;
        if state[O_STATUS] != CLAIMED {
            return Err(EscrowError::NotClaimed.into());
        }
        if key_at(&state, O_CLAIMANT) != *claimant.key {
            return Err(EscrowError::WrongClaimant.into());
        }
        state[O_STATUS] = PAID;
        u64_at(&state, O_AMOUNT)
    };
    pay_out(bounty, claimant, amount)
}

/// accounts: authority (signer: the recorded claimant, the approver or ITERA_ATTESTER), bounty (writable)
fn unclaim(program_id: &Pubkey, accounts: &[AccountInfo]) -> ProgramResult {
    let iter = &mut accounts.iter();
    let authority = next_account_info(iter)?;
    let bounty = next_account_info(iter)?;

    check_bounty(program_id, bounty)?;
    let mut state = bounty.try_borrow_mut_data()?;
    if state[O_STATUS] != CLAIMED {
        return Err(EscrowError::NotClaimed.into());
    }
    let allowed = *authority.key == key_at(&state, O_CLAIMANT) || *authority.key == key_at(&state, O_APPROVER) || *authority.key == ITERA_ATTESTER;
    if !authority.is_signer || !allowed {
        return Err(EscrowError::NotAuthorized.into());
    }
    state[O_CLAIMANT..O_CERT + 32].fill(0);
    state[O_STATUS] = OPEN;
    Ok(())
}

/// accounts: authority (signer: the approver or the sponsor; anyone once the bounty is past its expiry), bounty (writable), sponsor (writable)
fn refund(program_id: &Pubkey, accounts: &[AccountInfo]) -> ProgramResult {
    let iter = &mut accounts.iter();
    let authority = next_account_info(iter)?;
    let bounty = next_account_info(iter)?;
    let sponsor = next_account_info(iter)?;

    check_bounty(program_id, bounty)?;
    let amount = {
        let mut state = bounty.try_borrow_mut_data()?;
        let recorded_sponsor = key_at(&state, O_SPONSOR);
        let expires_at = i64::from_le_bytes(u64_at(&state, O_EXPIRES).to_le_bytes());
        let past_expiry = Clock::get()?.unix_timestamp >= expires_at;
        let named = *authority.key == key_at(&state, O_APPROVER) || *authority.key == recorded_sponsor;
        if !authority.is_signer || (!named && !past_expiry) {
            return Err(EscrowError::NotAuthorized.into());
        }
        if state[O_STATUS] != OPEN {
            return Err(EscrowError::NotOpen.into());
        }
        if recorded_sponsor != *sponsor.key {
            return Err(EscrowError::WrongSponsor.into());
        }
        state[O_STATUS] = REFUNDED;
        u64_at(&state, O_AMOUNT)
    };
    pay_out(bounty, sponsor, amount)
}
