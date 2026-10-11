import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/auth/AuthContext';
import { useProfile } from '@/hooks/useProfile';
import { useUpdateProfile } from '@/hooks/useUpdateProfile';
import { useI18n } from '@/i18n';
import { getSupabase } from '@/lib/supabase/client';
import {
  NICKNAME_ASKED_FLAG,
  generatedNameIn,
  isWalletUser,
  readNicknameSkipped,
  rememberNicknameSkipped,
  shouldShowNicknameGate,
  wasNicknameAsked,
} from '@/utils/nicknameGate';
import { NicknameForm } from './NicknameForm';

/** The question is put on the learner's home only: never on top of a lesson, a bounty someone linked to, or any other deep link. */
const ASKED_ON = ['/', '/dashboard'];
const HAPPY_HOLD_MS = 700;
const OTHER_DIALOG = '[role="dialog"]:not([data-nickname-gate]), [role="alertdialog"]';
const FOCUSABLE = 'input, button, [href], [tabindex]:not([tabindex="-1"])';

/** A dialog that is in the document but not drawn (a closed sheet kept mounted) does not count. */
function otherDialogOnScreen(): boolean {
  return [...document.querySelectorAll<HTMLElement>(OTHER_DIALOG)].some((el) => (typeof el.checkVisibility === 'function' ? el.checkVisibility({ visibilityProperty: true }) : true));
}

/** Whether some other dialog is on screen: the question waits for it instead of covering it. */
function useOtherDialogOpen(watch: boolean): boolean {
  const [, recheck] = useState(0);
  useEffect(() => {
    if (!watch) return;
    const observer = new MutationObserver(() => recheck((n) => n + 1));
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [watch]);
  // Read at render, not from state: the first render that is due must already see a dialog that is up.
  return watch && otherDialogOnScreen();
}

/**
 * "What should we call you?" for a wallet learner whose name was generated, or an
 * e-mail learner still named after the local part of the address. Asked ONCE per
 * account, on the dashboard only: the moment it shows, the account is marked as
 * asked, so a reload, another browser or "Skip for now" never bring it back. A
 * modal dialog that waits for any other dialog and never blocks: a failed profile
 * read renders nothing, a failed save keeps the form and toasts.
 */
export function NicknameGate() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const { t, locale } = useI18n();
  const profile = useProfile();
  const update = useUpdateProfile();
  const [opened, setOpened] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [happy, setHappy] = useState(false);
  const panel = useRef<HTMLDivElement>(null);

  const excluded = !ASKED_ON.includes(pathname.replace(/\/+$/, '') || '/');
  const due =
    !excluded &&
    shouldShowNicknameGate({
      user,
      profile: profile.data,
      skipped: readNicknameSkipped(user?.id) || wasNicknameAsked(user),
    });
  const otherDialog = useOtherDialogOpen(due && !opened);
  const userId = user?.id;

  // A session restored from storage carries the user as it was when it was saved: the account mark is read
  // fresh from the server before the question goes up, so a tab opened from an old session never asks again.
  const [fresh, setFresh] = useState<'unknown' | 'asked' | 'free'>('unknown');
  useEffect(() => {
    if (!due || otherDialog || opened || !userId || fresh !== 'unknown') return;
    let cancelled = false;
    void Promise.resolve()
      .then(() => getSupabase().auth.getUser())
      .then(({ data }) => {
        if (cancelled) return;
        const asked = data?.user?.user_metadata?.[NICKNAME_ASKED_FLAG] === true;
        if (asked) rememberNicknameSkipped(userId);
        setFresh(asked ? 'asked' : 'free');
      })
      .catch(() => {
        if (!cancelled) setFresh('free');
      });
    return () => {
      cancelled = true;
    };
  }, [due, otherDialog, opened, userId, fresh]);

  // Asked once: marked on the account when the question goes up, not when it is answered.
  useEffect(() => {
    if (!due || otherDialog || opened || !userId || fresh !== 'free') return;
    setOpened(true);
    rememberNicknameSkipped(userId);
    void getSupabase()
      .auth.updateUser({ data: { [NICKNAME_ASKED_FLAG]: true } })
      .catch(() => undefined);
  }, [due, otherDialog, opened, userId, fresh]);

  // A generated name follows the language of the account ("Tera Ousado 477" / "Tera Bold 477").
  const displayName = profile.data?.displayName;
  const renamed = useRef<string | null>(null);
  const mutate = update.mutate;
  useEffect(() => {
    if (!isWalletUser(user)) return;
    const localized = generatedNameIn(displayName, locale === 'en' ? 'en' : 'pt');
    if (!localized || renamed.current === localized) return;
    renamed.current = localized;
    mutate({ displayName: localized });
  }, [user, displayName, locale, mutate]);

  const show = opened && !dismissed && !excluded && Boolean(user);
  useEffect(() => {
    if (!show) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
    };
  }, [show]);
  if (!show) return null;

  function handleSkip() {
    setDismissed(true);
  }

  function handleSubmit(nickname: string) {
    setHappy(true);
    update.mutate(
      { displayName: nickname },
      {
        onSuccess: () => window.setTimeout(() => setDismissed(true), HAPPY_HOLD_MS),
        onError: () => {
          setHappy(false);
          toast.error(t('tera.nickname.saveError'));
        },
      },
    );
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      handleSkip();
      return;
    }
    if (event.key !== 'Tab' || !panel.current) return;
    const stops = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => !el.hasAttribute('disabled'));
    if (stops.length === 0) return;
    const first = stops[0];
    const last = stops[stops.length - 1];
    const inside = panel.current.contains(document.activeElement);
    if (event.shiftKey && (!inside || document.activeElement === first)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (!inside || document.activeElement === last)) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div data-testid="nickname-gate" className="fixed inset-0 z-40 flex items-center justify-center overflow-y-auto bg-[#0A0908]/85 p-4 backdrop-blur-sm" onKeyDown={handleKeyDown}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="nickname-gate-title"
        data-nickname-gate
        className="w-full max-w-[460px] rounded-3xl border border-[#262320] bg-[#0F0D0B] py-8 shadow-2xl"
      >
        <NicknameForm saving={update.isPending} happy={happy} helperKey={isWalletUser(user) ? 'tera.nickname.helper' : 'tera.nickname.helperEmail'} onSubmit={handleSubmit} onSkip={handleSkip} />
      </div>
    </div>
  );
}
