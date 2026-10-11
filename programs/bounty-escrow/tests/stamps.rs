use itera_bounty_escrow::{read_stamps, trail_hash, EscrowError};
use solana_program::program_error::ProgramError;

/// Account 9xRfj1YMw7QAeK5znr9PtPDpVqwqwBUrVFmp9mFi6eeY on devnet, read on 11 Oct 2026: frozen, `itera-v2`, `Week 1 · HTML`, 3 days.
const CERTIFICATION: &[u8] = include_bytes!("fixtures/certification.bin");
const PLUGIN_HEADER: usize = 217;
const FREEZE_BODY: usize = 226;
const ATTRIBUTES_AUTHORITY: usize = CERTIFICATION.len() - 13;

fn custom(error: EscrowError) -> ProgramError {
    ProgramError::Custom(error as u32)
}

fn find(haystack: &[u8], needle: &[u8]) -> usize {
    haystack.windows(needle.len()).position(|window| window == needle).unwrap()
}

#[test]
fn reads_the_freeze_the_trail_and_the_days() {
    let stamps = read_stamps(CERTIFICATION).unwrap();
    assert!(stamps.frozen);
    assert_eq!(stamps.days_done, 3);
    assert_eq!(stamps.trail, trail_hash(b"itera-v2", "Week 1 · HTML".as_bytes()));
    assert_ne!(stamps.trail, trail_hash(b"itera-v2", "Week 2 · CSS".as_bytes()));
}

#[test]
fn a_thawed_certification_is_not_frozen() {
    let mut asset = CERTIFICATION.to_vec();
    assert_eq!(asset[FREEZE_BODY..FREEZE_BODY + 2], [5, 1]);
    asset[FREEZE_BODY + 1] = 0;
    assert!(!read_stamps(&asset).unwrap().frozen);
}

#[test]
fn attributes_the_owner_could_write_do_not_count() {
    let mut asset = CERTIFICATION.to_vec();
    assert_eq!(asset[ATTRIBUTES_AUTHORITY - 1..ATTRIBUTES_AUTHORITY + 1], [6, 2]);
    asset[ATTRIBUTES_AUTHORITY] = 1;
    assert_eq!(read_stamps(&asset), Err(custom(EscrowError::CertificationWithoutStamps)));
}

#[test]
fn days_must_be_digits() {
    let mut asset = CERTIFICATION.to_vec();
    let at = find(&asset, b"days_done") + 9 + 4;
    assert_eq!(asset[at], b'3');
    asset[at] = b'9';
    assert_eq!(read_stamps(&asset).unwrap().days_done, 9);
    asset[at] = b'-';
    assert_eq!(read_stamps(&asset), Err(custom(EscrowError::CertificationWithoutStamps)));
}

#[test]
fn an_asset_without_plugins_has_no_stamps() {
    assert_eq!(CERTIFICATION[PLUGIN_HEADER], 3);
    assert_eq!(read_stamps(&CERTIFICATION[..PLUGIN_HEADER]), Err(custom(EscrowError::CertificationWithoutStamps)));
}

#[test]
fn a_cut_account_is_refused_not_read_past_its_end() {
    for len in 0..CERTIFICATION.len() - 4 {
        assert!(read_stamps(&CERTIFICATION[..len]).is_err(), "length {len}");
    }
}
