import { isGeneratedTeraName } from '@/utils/crystals';

/**
 * A learner's name is "generic" (so the pre-class name+avatar gate should show)
 * when it isn't a real name the person chose: empty, the default placeholder,
 * a bare uid slice, or the email local-part fallback.
 */
export function isGenericName(name: string | null | undefined, email?: string | null): boolean {
  const n = (name ?? '').trim();
  if (!n) return true;
  const lower = n.toLowerCase();
  if (lower === 'aluno' || lower === 'student') return true;
  // The uid-slice fallback (first 8 hex chars of the user id).
  if (/^[0-9a-f]{8}$/i.test(n)) return true;
  // The provisioning default `User <8-hex-uid-slice>` (e.g. "User c0c08d9d") —
  // stored verbatim in itera.users.display_name, so it arrives as a "real" name.
  if (/^user\s+[0-9a-f]{8}$/i.test(n)) return true;
  // The email local-part fallback — matched case-SENSITIVELY: the fallback uses
  // the raw local part verbatim, so a real "Ana" (email ana@) is NOT flagged,
  // while the raw "samuelstefanodocarmo" fallback is.
  // A wallet address, full or shortened (`CQzi…DAhW`, `2rAa...nqA`), is never a name.
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(n)) return true;
  if (/^[1-9A-HJ-NP-Za-km-z]{3,8}(…|\.{2,3})[1-9A-HJ-NP-Za-km-z]{3,8}$/.test(n)) return true;
  const localRaw = (email ?? '').split('@')[0].trim();
  if (localRaw && n === localRaw) return true;
  return false;
}

/**
 * Should we ASK this learner what to call them? A wallet-shaped or otherwise generic name, or the friendly
 * "Tera <Word> <3 digits>" that provisioning generates. Not the same as what we DISPLAY: a generated
 * name is shown as the name (never the wallet); only `isGenericName` names fall back.
 */
export function shouldAskForName(name: string | null | undefined, email?: string | null): boolean {
  return isGenericName(name, email) || isGeneratedTeraName((name ?? '').trim());
}
