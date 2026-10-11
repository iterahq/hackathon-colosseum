use itera_bounty_escrow::{process_instruction, trail_hash, EscrowError, CLAIMED, DIRECT_STATE_LEN, GATED_STATE_LEN, ID, MPL_CORE, OPEN, PAID, REFUNDED};
use solana_program::{
    account_info::AccountInfo,
    clock::Clock,
    entrypoint::ProgramResult,
    instruction::Instruction,
    program_error::ProgramError,
    program_stubs::{set_syscall_stubs, SyscallStubs},
    pubkey::Pubkey,
    rent::Rent,
    system_program,
};
use std::{cell::Cell, sync::Once};

/// Account 9xRfj1YMw7QAeK5znr9PtPDpVqwqwBUrVFmp9mFi6eeY on devnet, read on 11 Oct 2026: frozen, `itera-v2`, `Week 1 · HTML`, 3 days.
const CERTIFICATION: &[u8] = include_bytes!("fixtures/certification.bin");
const START: i64 = 1_800_000_000;
const EXPIRES: i64 = START + 3_600;
const AMOUNT: u64 = 20_000_000;
const ID_BYTES: [u8; 16] = [7; 16];
const O_STATUS: usize = 2;
const O_CLAIMANT: usize = 131;
const O_INVITEE: usize = 228;

thread_local! {
    static NOW: Cell<i64> = const { Cell::new(START) };
}

/// The three things the program asks the runtime: the time, the rent, and the system program's `create_account`.
struct Chain;

impl SyscallStubs for Chain {
    fn sol_get_clock_sysvar(&self, var_addr: *mut u8) -> u64 {
        unsafe { *(var_addr as *mut Clock) = Clock { unix_timestamp: NOW.with(Cell::get), ..Clock::default() } };
        0
    }

    fn sol_get_rent_sysvar(&self, var_addr: *mut u8) -> u64 {
        unsafe { *(var_addr as *mut Rent) = Rent::default() };
        0
    }

    fn sol_invoke_signed(&self, instruction: &Instruction, accounts: &[AccountInfo], signers: &[&[&[u8]]]) -> ProgramResult {
        assert_eq!(instruction.program_id, system_program::ID);
        assert_eq!(instruction.data[..4], [0, 0, 0, 0]);
        let lamports = u64::from_le_bytes(instruction.data[4..12].try_into().unwrap());
        let space = u64::from_le_bytes(instruction.data[12..20].try_into().unwrap()) as usize;
        let owner = Pubkey::new_from_array(instruction.data[20..52].try_into().unwrap());
        let (funder, created) = (&accounts[0], &accounts[1]);
        assert_eq!(Pubkey::create_program_address(signers[0], &ID).unwrap(), *created.key);
        let left = funder.lamports().checked_sub(lamports).ok_or(ProgramError::InsufficientFunds)?;
        **funder.try_borrow_mut_lamports()? = left;
        **created.try_borrow_mut_lamports()? += lamports;
        *created.try_borrow_mut_data()? = Box::leak(vec![0u8; space].into_boxed_slice());
        created.assign(&owner);
        Ok(())
    }
}

fn chain_at(now: i64) {
    static INSTALL: Once = Once::new();
    INSTALL.call_once(|| {
        set_syscall_stubs(Box::new(Chain));
    });
    NOW.with(|clock| clock.set(now));
}

fn custom(error: EscrowError) -> ProgramError {
    ProgramError::Custom(error as u32)
}

struct Account {
    key: Pubkey,
    lamports: u64,
    data: Vec<u8>,
    owner: Pubkey,
}

fn wallet(lamports: u64) -> Account {
    Account { key: Pubkey::new_unique(), lamports, data: Vec::new(), owner: system_program::ID }
}

/// The fixture certification as if `owner` held it: same collection, same trail, three stamped days, frozen.
fn certification_of(owner: &Pubkey) -> Account {
    let mut data = CERTIFICATION.to_vec();
    data[1..33].copy_from_slice(owner.as_ref());
    Account { key: Pubkey::new_unique(), lamports: 1, data, owner: MPL_CORE }
}

fn collection() -> Pubkey {
    Pubkey::new_from_array(CERTIFICATION[34..66].try_into().unwrap())
}

fn call(data: &[u8], accounts: &mut [(&mut Account, bool)]) -> ProgramResult {
    let (result, written) = {
        let infos: Vec<AccountInfo> = accounts
            .iter_mut()
            .map(|(account, signer)| AccountInfo::new(&account.key, *signer, true, &mut account.lamports, &mut account.data[..], &account.owner, false, 0))
            .collect();
        let result = process_instruction(&ID, &infos, data);
        let written: Vec<Vec<u8>> = infos.iter().map(|info| info.data.borrow().to_vec()).collect();
        (result, written)
    };
    for ((account, _), data) in accounts.iter_mut().zip(written) {
        account.data = data;
    }
    result
}

struct Bounty {
    funder: Account,
    escrow: Account,
    sponsor: Account,
    approver: Account,
    collection: Account,
    system: Account,
    invitee: Account,
}

fn trail() -> [u8; 32] {
    trail_hash(b"itera-v2", "Week 1 · HTML".as_bytes())
}

fn terms(min_days: u8) -> Vec<u8> {
    let mut data = Vec::new();
    data.extend_from_slice(&ID_BYTES);
    data.extend_from_slice(&AMOUNT.to_le_bytes());
    data.extend_from_slice(&EXPIRES.to_le_bytes());
    data.push(min_days);
    data.extend_from_slice(&trail());
    data
}

fn address(bounty: &Bounty, min_days: u8, invitee: Option<&Pubkey>) -> Pubkey {
    let trail = trail();
    let amount = AMOUNT.to_le_bytes();
    let expires = EXPIRES.to_le_bytes();
    let days = [min_days];
    let mut seeds: Vec<&[u8]> = vec![b"bounty", &ID_BYTES, bounty.sponsor.key.as_ref(), bounty.approver.key.as_ref(), bounty.collection.key.as_ref(), &amount, &expires, &days, &trail];
    if let Some(invitee) = invitee {
        seeds.push(invitee.as_ref());
    }
    Pubkey::find_program_address(&seeds, &ID).0
}

fn unfunded() -> Bounty {
    Bounty {
        funder: wallet(1_000_000_000),
        escrow: wallet(0),
        sponsor: wallet(0),
        approver: wallet(0),
        collection: Account { key: collection(), lamports: 1, data: Vec::new(), owner: MPL_CORE },
        system: Account { key: system_program::ID, lamports: 1, data: Vec::new(), owner: system_program::ID },
        invitee: wallet(0),
    }
}

fn create(bounty: &mut Bounty, data: &[u8]) -> ProgramResult {
    call(
        data,
        &mut [
            (&mut bounty.funder, true),
            (&mut bounty.escrow, false),
            (&mut bounty.sponsor, false),
            (&mut bounty.approver, false),
            (&mut bounty.collection, false),
            (&mut bounty.system, false),
        ],
    )
}

fn create_direct(bounty: &mut Bounty, min_days: u8) -> ProgramResult {
    bounty.escrow.key = address(bounty, min_days, Some(&bounty.invitee.key));
    let mut data = vec![6];
    data.extend_from_slice(&terms(min_days));
    data.extend_from_slice(bounty.invitee.key.as_ref());
    create(bounty, &data)
}

fn direct(min_days: u8) -> Bounty {
    chain_at(START);
    let mut bounty = unfunded();
    create_direct(&mut bounty, min_days).unwrap();
    bounty
}

fn accept(bounty: &mut Bounty, claimant: &mut Account, certification: &mut Account, signed: bool) -> ProgramResult {
    let mut nobody = wallet(0);
    call(&[1], &mut [(&mut nobody, false), (&mut bounty.escrow, false), (claimant, signed), (certification, false)])
}

#[test]
fn create_direct_writes_the_invitee_after_the_gated_terms() {
    let bounty = direct(3);
    let state = &bounty.escrow.data;
    assert_eq!(state.len(), DIRECT_STATE_LEN);
    assert_eq!(state[0], 3);
    assert_eq!(state[O_STATUS], OPEN);
    assert_eq!(state[3..19], ID_BYTES);
    assert_eq!(state[19..51], bounty.sponsor.key.to_bytes());
    assert_eq!(state[51..83], bounty.approver.key.to_bytes());
    assert_eq!(state[83..115], bounty.collection.key.to_bytes());
    assert_eq!(state[115..123], AMOUNT.to_le_bytes());
    assert_eq!(state[123..131], EXPIRES.to_le_bytes());
    assert_eq!(state[O_CLAIMANT..195], [0u8; 64]);
    assert_eq!(state[195], 3);
    assert_eq!(state[196..O_INVITEE], trail());
    assert_eq!(state[O_INVITEE..], bounty.invitee.key.to_bytes());
    assert_eq!(bounty.escrow.owner, ID);
    assert_eq!(bounty.escrow.lamports, Rent::default().minimum_balance(DIRECT_STATE_LEN) + AMOUNT);
}

#[test]
fn the_address_of_a_direct_bounty_commits_to_its_invitee() {
    chain_at(START);
    let mut bounty = unfunded();
    let mut data = vec![6];
    data.extend_from_slice(&terms(3));
    data.extend_from_slice(bounty.invitee.key.as_ref());

    bounty.escrow.key = address(&bounty, 3, None);
    assert_eq!(create(&mut bounty, &data), Err(custom(EscrowError::WrongEscrowAccount)));
    bounty.escrow.key = address(&bounty, 3, Some(&Pubkey::new_unique()));
    assert_eq!(create(&mut bounty, &data), Err(custom(EscrowError::WrongEscrowAccount)));
    assert!(bounty.escrow.data.is_empty());

    bounty.escrow.key = address(&bounty, 3, Some(&bounty.invitee.key));
    assert_eq!(create(&mut bounty, &data[..96]), Err(ProgramError::InvalidInstructionData));
    data[33] = 0;
    assert_eq!(create(&mut bounty, &data), Err(custom(EscrowError::InvalidRequirement)));
}

#[test]
fn a_gated_bounty_keeps_its_228_bytes_and_takes_any_eligible_wallet() {
    chain_at(START);
    let mut bounty = unfunded();
    bounty.escrow.key = address(&bounty, 3, None);
    let mut data = vec![5];
    data.extend_from_slice(&terms(3));
    create(&mut bounty, &data).unwrap();
    assert_eq!(bounty.escrow.data.len(), GATED_STATE_LEN);
    assert_eq!(bounty.escrow.data[0], 2);

    let mut anyone = wallet(0);
    let mut certification = certification_of(&anyone.key);
    accept(&mut bounty, &mut anyone, &mut certification, true).unwrap();
    assert_eq!(bounty.escrow.data[O_STATUS], CLAIMED);
}

#[test]
fn the_invitee_accepts_and_is_paid() {
    let mut bounty = direct(3);
    let mut invitee = Account { key: bounty.invitee.key, ..wallet(0) };
    let mut certification = certification_of(&invitee.key);

    assert_eq!(accept(&mut bounty, &mut invitee, &mut certification, false), Err(custom(EscrowError::ClaimantMustSign)));
    accept(&mut bounty, &mut invitee, &mut certification, true).unwrap();
    assert_eq!(bounty.escrow.data[O_STATUS], CLAIMED);
    assert_eq!(bounty.escrow.data[O_CLAIMANT..O_CLAIMANT + 32], invitee.key.to_bytes());
    assert_eq!(bounty.escrow.data[O_CLAIMANT + 32..195], certification.key.to_bytes());

    call(&[2], &mut [(&mut bounty.approver, true), (&mut bounty.escrow, false), (&mut invitee, false)]).unwrap();
    assert_eq!(bounty.escrow.data[O_STATUS], PAID);
    assert_eq!(invitee.lamports, AMOUNT);
    assert_eq!(bounty.escrow.data[O_INVITEE..], invitee.key.to_bytes());
}

#[test]
fn an_eligible_wallet_that_was_not_invited_is_refused() {
    let mut bounty = direct(3);
    let mut stranger = wallet(0);
    let mut certification = certification_of(&stranger.key);
    assert_eq!(accept(&mut bounty, &mut stranger, &mut certification, true), Err(custom(EscrowError::NotInvited)));
    assert_eq!(bounty.escrow.data[O_STATUS], OPEN);
    assert_eq!(bounty.escrow.data[O_CLAIMANT..195], [0u8; 64]);

    let mut of_the_invitee = certification_of(&bounty.invitee.key);
    assert_eq!(accept(&mut bounty, &mut stranger, &mut of_the_invitee, true), Err(custom(EscrowError::NotInvited)));
}

#[test]
fn the_invitee_still_needs_the_stamped_days() {
    let mut bounty = direct(4);
    let mut invitee = Account { key: bounty.invitee.key, ..wallet(0) };
    let mut own = certification_of(&invitee.key);
    assert_eq!(accept(&mut bounty, &mut invitee, &mut own, true), Err(custom(EscrowError::NotEnoughStampedDays)));
    let mut of_a_stranger = certification_of(&Pubkey::new_unique());
    assert_eq!(accept(&mut bounty, &mut invitee, &mut of_a_stranger, true), Err(custom(EscrowError::CertificationNotOwnedByClaimant)));
}

#[test]
fn giving_up_keeps_the_invitation() {
    let mut bounty = direct(3);
    let mut invitee = Account { key: bounty.invitee.key, ..wallet(0) };
    let mut certification = certification_of(&invitee.key);
    accept(&mut bounty, &mut invitee, &mut certification, true).unwrap();
    call(&[3], &mut [(&mut invitee, true), (&mut bounty.escrow, false)]).unwrap();
    assert_eq!(bounty.escrow.data[O_STATUS], OPEN);
    assert_eq!(bounty.escrow.data[O_INVITEE..], invitee.key.to_bytes());

    let mut stranger = wallet(0);
    let mut of_the_stranger = certification_of(&stranger.key);
    assert_eq!(accept(&mut bounty, &mut stranger, &mut of_the_stranger, true), Err(custom(EscrowError::NotInvited)));
    accept(&mut bounty, &mut invitee, &mut certification, true).unwrap();
}

#[test]
fn past_its_expiry_anyone_returns_the_reward_to_the_sponsor() {
    let mut bounty = direct(3);
    let mut stranger = wallet(0);
    let refund = |bounty: &mut Bounty, stranger: &mut Account| call(&[4], &mut [(stranger, true), (&mut bounty.escrow, false), (&mut bounty.sponsor, false)]);

    assert_eq!(refund(&mut bounty, &mut stranger), Err(custom(EscrowError::NotAuthorized)));
    chain_at(EXPIRES);
    let mut invitee = Account { key: bounty.invitee.key, ..wallet(0) };
    let mut certification = certification_of(&invitee.key);
    assert_eq!(accept(&mut bounty, &mut invitee, &mut certification, true), Err(custom(EscrowError::Expired)));
    assert_eq!(call(&[4], &mut [(&mut stranger, true), (&mut bounty.escrow, false), (&mut invitee, false)]), Err(custom(EscrowError::WrongSponsor)));

    refund(&mut bounty, &mut stranger).unwrap();
    assert_eq!(bounty.escrow.data[O_STATUS], REFUNDED);
    assert_eq!(bounty.sponsor.lamports, AMOUNT);
    assert_eq!(stranger.lamports, 0);
    assert_eq!(refund(&mut bounty, &mut stranger), Err(custom(EscrowError::NotOpen)));
}
