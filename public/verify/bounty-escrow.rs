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
//!   reads the asset account itself. An attester co-signs (the bounty's
//!   approver, or Itera's attester key): it vouches for what the program does
//!   not read (how many days the certification has stamped).
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

pub const SEED: &[u8] = b"bounty";
pub const STATE_LEN: usize = 195;
const TAG: u8 = 1;

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
    if bounty.owner != program_id || bounty.data_len() != STATE_LEN || bounty.try_borrow_data()?[O_TAG] != TAG {
        return Err(EscrowError::WrongEscrowAccount.into());
    }
    Ok(())
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
    let iter = &mut accounts.iter();
    let funder = next_account_info(iter)?;
    let bounty = next_account_info(iter)?;
    let sponsor = next_account_info(iter)?;
    let approver = next_account_info(iter)?;
    let collection = next_account_info(iter)?;
    let system = next_account_info(iter)?;

    if data.len() != 32 {
        return Err(ProgramError::InvalidInstructionData);
    }
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
    let seeds: [&[u8]; 7] = [
        SEED,
        id,
        sponsor.key.as_ref(),
        approver.key.as_ref(),
        collection.key.as_ref(),
        &data[16..24],
        &data[24..32],
    ];
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

    let lamports = Rent::get()?
        .minimum_balance(STATE_LEN)
        .checked_add(amount)
        .ok_or(ProgramError::ArithmeticOverflow)?;
    invoke_signed(
        &system_instruction::create_account(funder.key, bounty.key, lamports, STATE_LEN as u64, program_id),
        &[funder.clone(), bounty.clone(), system.clone()],
        &[&[seeds[0], seeds[1], seeds[2], seeds[3], seeds[4], seeds[5], seeds[6], &[bump]]],
    )?;

    let mut state = bounty.try_borrow_mut_data()?;
    state[O_TAG] = TAG;
    state[O_BUMP] = bump;
    state[O_STATUS] = OPEN;
    state[O_ID..O_ID + 16].copy_from_slice(id);
    state[O_SPONSOR..O_SPONSOR + 32].copy_from_slice(sponsor.key.as_ref());
    state[O_APPROVER..O_APPROVER + 32].copy_from_slice(approver.key.as_ref());
    state[O_COLLECTION..O_COLLECTION + 32].copy_from_slice(collection.key.as_ref());
    state[O_AMOUNT..O_AMOUNT + 8].copy_from_slice(&amount.to_le_bytes());
    state[O_EXPIRES..O_EXPIRES + 8].copy_from_slice(&expires_at.to_le_bytes());
    Ok(())
}

/// accounts: attester (signer: the approver or ITERA_ATTESTER), bounty (writable), claimant (signer), certification (the claimant's Core asset)
fn accept(program_id: &Pubkey, accounts: &[AccountInfo]) -> ProgramResult {
    let iter = &mut accounts.iter();
    let attester = next_account_info(iter)?;
    let bounty = next_account_info(iter)?;
    let claimant = next_account_info(iter)?;
    let certification = next_account_info(iter)?;

    check_bounty(program_id, bounty)?;
    let mut state = bounty.try_borrow_mut_data()?;
    if *attester.key == ITERA_ATTESTER {
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
