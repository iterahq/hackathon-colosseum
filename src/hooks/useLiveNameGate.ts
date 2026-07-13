/**
 * State + persistence for the pre-class name+avatar gate. Keeps the component
 * thin: it holds the draft name/avatar, saves to the Itera profile (override),
 * refreshes the profile query, and reports success back to the page.
 */
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { updateMyProfile } from '@/services/profile.service';
import { LIVE_AVATAR_PRESETS } from '@/consts/liveAvatars';

interface UseLiveNameGateArgs {
  initialName?: string;
  initialAvatarUrl?: string | null;
  onDone: () => void;
}

export function useLiveNameGate({ initialName, initialAvatarUrl, onDone }: UseLiveNameGateArgs) {
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
