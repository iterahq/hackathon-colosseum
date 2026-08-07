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
 * that reserves space at the expected size (image: h-64, video: h-72) so the
 * layout does not shift when the media arrives. The skeleton disappears once
 * the element fires its load event.
 *
 * A imagem da instrução vive em `InstructionImage`: o campo recebe diagrama e
 * ilustração larga, que numa coluna de celular ficam ilegíveis se a caixa tiver
 * altura fixa — por isso ela acompanha a imagem e abre ampliada no toque. Cortar
 * a borda não custa nada numa foto, mas custa quando a imagem É o conteúdo: os
 * diagramas da aula de Git perdiam título e legenda no corte.
 *
 * Texto e descrição passam pelo RichText: 25 das 47 activities `concept` em
 * produção já escrevem markdown-leve, e num <p> só o aluno lia os asteriscos.
 */
import { useState } from 'react';
import { RichText } from './RichText.js';
import { InstructionImage } from './InstructionImage.js';
import type { InstructionPanelSpec } from '../specs.js';

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
  const [videoLoaded, setVideoLoaded] = useState(false);

  if (!spec) return null;
  const { text, image_url, video_url, audio_url, description } = spec;
  const hasAny = Boolean(text || image_url || video_url || audio_url || description);
  if (!hasAny) return null;

  return (
    <div className={`space-y-4 ${className}`} data-testid="instruction-panel">
      {text && <RichText text={text} data-testid="instruction-text" />}

      {image_url && <InstructionImage src={image_url} alt={text ?? 'instruction'} />}

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
        <RichText text={description} muted data-testid="instruction-description" />
      )}
    </div>
  );
}
