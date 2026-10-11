import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/auth/AuthContext';
import { useProfile } from '@/hooks/useProfile';
import { useUpdateProfile } from '@/hooks/useUpdateProfile';
import { useI18n } from '@/i18n';
import {
  readNicknameSkipped,
  rememberNicknameSkipped,
  shouldShowNicknameGate,
} from '@/utils/nicknameGate';
import { NicknameForm } from './NicknameForm';

const EXCLUDED_PREFIXES = ['/c/', '/login', '/signup', '/auth/', '/g/', '/lesson/', '/live/'];
const HAPPY_HOLD_MS = 700;

/**
 * One-time "what should we call you?" step for wallet users whose display name is
 * still a shortened address. Never blocks: a failed profile read renders nothing,
 * a failed save keeps the form and toasts.
 */
export function NicknameGate() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const { t } = useI18n();
  const profile = useProfile();
  const update = useUpdateProfile();
  const [dismissed, setDismissed] = useState(false);
  const [happy, setHappy] = useState(false);

  const excluded = EXCLUDED_PREFIXES.some((p) => pathname === p.replace(/\/$/, '') || pathname.startsWith(p));
  const show =
    !dismissed &&
    !excluded &&
    shouldShowNicknameGate({
      user,
      profile: profile.data,
      skipped: readNicknameSkipped(user?.id),
    });
  useEffect(() => {
    if (!show) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
    };
  }, [show]);
  if (!show || !user) return null;

  function handleSkip() {
    rememberNicknameSkipped(user!.id);
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

  return (
    <div
      data-testid="nickname-gate"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[#0A0908] bg-[linear-gradient(#15130F_1px,transparent_1px),linear-gradient(90deg,#15130F_1px,transparent_1px)] bg-[length:26px_26px]"
    >
      <NicknameForm saving={update.isPending} happy={happy} onSubmit={handleSubmit} onSkip={handleSkip} />
    </div>
  );
}
