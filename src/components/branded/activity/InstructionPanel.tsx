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
 */
import type { InstructionPanelSpec } from '@/types/content';

export function InstructionPanel({
  spec,
  className = '',
}: {
  spec: InstructionPanelSpec | undefined | null;
  className?: string;
}) {
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
          <img src={image_url} alt={text ?? 'instruction'} className="w-full max-h-80 object-contain mx-auto" />
        </div>
      )}

      {video_url && (
        <div className="rounded-2xl border border-border bg-obsidiana/60 overflow-hidden" data-testid="instruction-video">
          <video src={video_url} controls className="w-full max-h-96 bg-black" />
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
