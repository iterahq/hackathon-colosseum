import { useState } from 'react';
import { Play } from 'lucide-react';
import { useActivityI18n } from '../context.js';
import { MediaLightbox } from './MediaLightbox.js';

const FILE_EXTENSIONS = ['.mp4', '.webm'];

/** True for an http(s) URL that points at a video FILE — the only kind the lightbox can play. */
export function isPlayableFileUrl(url: string): boolean {
  try {
    const { protocol, pathname } = new URL(url);
    if (protocol !== 'https:' && protocol !== 'http:') return false;
    const path = pathname.toLowerCase();
    return FILE_EXTENSIONS.some((ext) => path.endsWith(ext));
  } catch {
    return false;
  }
}

/** A compact tactile pill that opens the instruction's video on demand; text stays the default. */
export function OptionalVideoButton({ src, onUnplayable }: { src: string; onUnplayable?: () => void }) {
  const { t } = useActivityI18n();
  const [open, setOpen] = useState(false);
  const label = t('activity.video.optional');
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="instruction-video-optional"
        className="inline-flex h-11 items-center gap-2.5 rounded-2xl border-2 border-b-4 border-border bg-card pl-2 pr-4 text-sm font-semibold text-foreground transition-[transform,border-color] duration-100 hover:border-foreground/25 active:translate-y-[2px] active:border-b-2"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-evergreen text-obsidiana">
          <Play className="h-3.5 w-3.5 fill-current" aria-hidden />
        </span>
        {label}
      </button>
      {open && (
        <MediaLightbox src={src} kind="video" label={label} onClose={() => setOpen(false)}
          onError={() => {
            setOpen(false);
            onUnplayable?.();
          }}
        />
      )}
    </>
  );
}
