/**
 * InstructionPanel — the shared "lesson instruction" primitive (plan ADR-2).
 *
 * A flexible context block reused by most general activity types. Renders ANY
 * combination of text · image · video · audio + an optional description below.
 * All fields are optional — it can be all of them, just an image, just text,
 * etc. The flexibility is the point. When the spec is empty it renders nothing.
 *
 * Render order (top→bottom): text (the prominent prompt) → image → video →
 * audio → description (muted secondary note). Brand DS: dark card surfaces,
 * evergreen/menta accents, JB-mono eyebrow voice inherited from the shell.
 *
 * Media loading: image and video elements are preceded by a pulse skeleton
 * that reserves space at the expected size (image: aspect-[4/3], video:
 * h-72) so the layout does not shift when the media arrives. The skeleton
 * disappears once the element fires its load event.
 *
 * Instruction image container: fixed 4:3 aspect ratio (roughly 800x600 —
 * the provisional standard, "dps adaptamos"), object-cover crop-to-fill.
 * Taller than the previous fixed h-64 so cover crops less aggressively.
 */
import { useState } from 'react';
import type { InstructionPanelSpec } from '@/types/content';

/** Pulse skeleton — same border-radius as the media containers. */
function MediaSkeleton({ height = 'h-64' }: { height?: string }) {
  return (
    <div
      className={`w-full ${height} animate-pulse rounded-2xl bg-muted-foreground/10`}
      aria-hidden="true"
      data-testid="media-skeleton"
    />
  );
}

export function InstructionPanel({
  spec,
  className = '',
}: {
  spec: InstructionPanelSpec | undefined | null;
  className?: string;
}) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [videoLoaded, setVideoLoaded] = useState(false);

  if (!spec) return null;
  const { text, image_url, video_url, audio_url, description } = spec;
  const hasAny = Boolean(text || image_url || video_url || audio_url || description);
  if (!hasAny) return null;

  return (
    <div className={`space-y-4 ${className}`} data-testid="instruction-panel">
      {text && (
        <p
          className="font-display text-lg md:text-xl text-foreground leading-relaxed"
          data-testid="instruction-text"
        >
          {text}
        </p>
      )}

      {image_url && (
        <div className="rounded-2xl border border-border bg-obsidiana/60 overflow-hidden" data-testid="instruction-image">
          {!imageLoaded && <MediaSkeleton height="aspect-[4/3]" />}
          <img
            src={image_url}
            alt={text ?? 'instruction'}
            className={`w-full object-cover mx-auto transition-opacity duration-300 ${imageLoaded ? 'opacity-100 aspect-[4/3]' : 'opacity-0 h-0'}`}
            onLoad={() => setImageLoaded(true)}
          />
        </div>
      )}

      {video_url && (
        <div className="rounded-2xl border border-border bg-obsidiana/60 overflow-hidden" data-testid="instruction-video">
          {!videoLoaded && <MediaSkeleton height="h-72" />}
          <video
            src={video_url}
            controls
            className={`w-full max-h-96 bg-black transition-opacity duration-300 ${videoLoaded ? 'opacity-100' : 'opacity-0 h-0'}`}
            onLoadedMetadata={() => setVideoLoaded(true)}
          />
        </div>
      )}

      {audio_url && (
        <audio src={audio_url} controls className="w-full" data-testid="instruction-audio" />
      )}

      {description && (
        <p className="text-sm text-muted-foreground leading-relaxed" data-testid="instruction-description">
          {description}
        </p>
      )}
    </div>
  );
}
