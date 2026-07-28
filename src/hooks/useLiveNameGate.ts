/**
 * State + persistence for the pre-class name+avatar gate. Keeps the component
 * thin: it holds the draft name/avatar, persists it, and reports success back to
 * the page.
 *
 * TWO persistence modes, ONE UI (plan 20260728-itera-guest-link-aula-sincrona):
 *
 *  - **member** (default) — `updateMyProfile()`, an UPDATE on `itera.users` gated
 *    by `users_update_self`. Works only for an ALREADY-provisioned user; this is
 *    the "your display name is still a placeholder" step.
 *  - **guest** (`guest.code` present) — there is no row to update, and no session
 *    at all. The same form instead calls
 *    `POST /v1/live/guest-session {code, name, avatar_url}`, which mints a real
 *    Supabase session server-side (ADR-1) and applies it via `setSession()`.
 *
 * The component is reused verbatim; only the submit behaviour swaps.
 */
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { updateMyProfile } from '@/services/profile.service';
import { createGuestSession, type GuestSession } from '@/services/guestSession.service';
import { LIVE_AVATAR_PRESETS } from '@/consts/liveAvatars';

export interface LiveNameGateGuestArgs {
  /** The `/g/:code` code — its presence is what selects the guest submit path. */
  code: string;
  /** Called with the minted guest session once the join succeeds. */
  onJoined: (guest: GuestSession) => void;
}

interface UseLiveNameGateArgs {
  initialName?: string;
  initialAvatarUrl?: string | null;
  onDone: () => void;
  guest?: LiveNameGateGuestArgs;
}

export function useLiveNameGate({
  initialName,
  initialAvatarUrl,
  onDone,
  guest,
}: UseLiveNameGateArgs) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(initialName?.trim() ?? '');
  const [avatarUrl, setAvatarUrl] = useState<string>(
    initialAvatarUrl && initialAvatarUrl.length > 0 ? initialAvatarUrl : LIVE_AVATAR_PRESETS[0]
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  const canSubmit = name.trim().length >= 2 && !saving;

  async function submit() {
    if (!canSubmit) return;
    setSaving(true);
    setError(false);

    if (guest) {
      // No account, no itera.users row, no session — the server mints all three
      // from the class code. A dead code (the class ended) surfaces as the same
      // inline error the member path uses; there is nowhere else to send them.
      try {
        const joined = await createGuestSession({ code: guest.code, name: name.trim(), avatarUrl });
        setSaving(false);
        guest.onJoined(joined);
        onDone();
      } catch {
        setSaving(false);
        setError(true);
      }
      return;
    }

    const ok = await updateMyProfile({ displayName: name.trim(), avatarUrl });
    setSaving(false);
    if (!ok) {
      setError(true);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ['profile'] });
    onDone();
  }

  return { name, setName, avatarUrl, setAvatarUrl, saving, error, canSubmit, submit };
}
