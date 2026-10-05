import { useState } from 'react';

interface LiveAvatarProps {
  name: string;
  avatarUrl?: string | null;
  /** Tailwind size classes (defaults to a compact roster size). */
  size?: string;
}

/**
 * A small round participant avatar for the live-class surfaces (roster,
 * answerers, ranking, reception). Shows the user's photo when known, falling
 * back to the first initial on a muted disc — including when the image fails to
 * load (flaky network / dead avatar URL). Raw <img> (the pattern already used
 * by AppHeader) to stay theme-safe under itera's Tailwind.
 */
export function LiveAvatar({ name, avatarUrl, size = 'w-6 h-6' }: LiveAvatarProps) {
  const [broken, setBroken] = useState(false);
  if (avatarUrl && !broken) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        onError={() => setBroken(true)}
        className={`${size} rounded-full object-cover shrink-0 border border-border`}
        data-testid="live-avatar"
      />
    );
  }
  return (
    <span
      className={`${size} rounded-full shrink-0 bg-muted text-muted-foreground flex items-center justify-center text-[10px] font-mono uppercase`}
      data-testid="live-avatar-fallback"
      aria-hidden="true"
    >
      {name.slice(0, 1)}
    </span>
  );
}
