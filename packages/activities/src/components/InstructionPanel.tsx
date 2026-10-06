/**
 * InstructionPanel — the shared "lesson instruction" primitive (plan ADR-2).
 *
 * A flexible context block reused by most general activity types. Renders ANY
 * combination of text · image · video · audio + an optional description below.
 * All fields are optional — it can be all of them, just an image, just text,
 * etc. The flexibility is the point. When the spec is empty it renders nothing.
 *
 * Render order (top→bottom): text (the prominent prompt) → image → video →
 * audio → description (muted secondary note). Beside an image the description
 * is that image's text alternative and is not drawn: a caption under every
 * diagram was a band of scroll. Brand DS: dark card surfaces,
 * evergreen/menta accents, JB-mono eyebrow voice inherited from the shell.
 *
 * Media loading: image and video reserve space with a pulse skeleton so the
 * layout does not shift when the media arrives; the skeleton disappears once
 * the element fires its load event. Both live in their own components —
 * `InstructionImage` (zoom) and `InstructionVideo` (host externo).
 *
 * A imagem da instrução vive em `InstructionImage`: o campo recebe diagrama e
 * ilustração larga, que numa coluna de celular ficam ilegíveis se a caixa tiver
 * altura fixa — por isso ela acompanha a imagem e abre ampliada no toque. Cortar
 * a borda não custa nada numa foto, mas custa quando a imagem É o conteúdo: os
 * diagramas da aula de Git perdiam título e legenda no corte.
 *
 * Vídeo: o texto é o padrão. Com `text` E `video_url` (arquivo http/https .mp4
 * ou .webm) o vídeo vira um botão opcional logo abaixo do texto
 * (`OptionalVideoButton`, abre no lightbox) em vez do player inline. Sem texto
 * (instrução só de vídeo), com link de página (YouTube etc.) ou com
 * `inlineVideo`, ou depois de o arquivo falhar ao tocar no lightbox, vale o
 * `InstructionVideo` inline de sempre — o kind `video` passa `inlineVideo` porque o vídeo É a atividade.
 *
 * Texto e descrição passam pelo RichText: 25 das 47 activities `concept` em
 * produção já escrevem markdown-leve, e num <p> só o aluno lia os asteriscos.
 */
import { useState } from 'react';
import { RichText } from './RichText.js';
import { InstructionImage } from './InstructionImage.js';
import { InstructionVideo } from './InstructionVideo.js';
import { OptionalVideoButton, isPlayableFileUrl } from './OptionalVideoButton.js';
import type { InstructionPanelSpec } from '../specs.js';

export function InstructionPanel({
  spec,
  className = '',
  inlineVideo = false,
  reading = false,
}: {
  spec: InstructionPanelSpec | undefined | null;
  className?: string;
  /** Keep the video as an inline player even beside text (the `video` kind). */
  inlineVideo?: boolean;
  /** The text IS the screen (concept): long-form reading rhythm instead of the prompt above an exercise. */
  reading?: boolean;
}) {
  // Keyed by src, like `InstructionVideo`: a failed file never condemns the next video.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (!spec) return null;
  const { text, image_url, video_url, audio_url, description } = spec;
  const hasAny = Boolean(text || image_url || video_url || audio_url || description);
  if (!hasAny) return null;

  const optionalVideo = Boolean(
    text && video_url && !inlineVideo && failedSrc !== video_url && isPlayableFileUrl(video_url),
  );

  return (
    <div className={`space-y-3 ${className}`} data-testid="instruction-panel">
      {text && <RichText text={text} reading={reading} data-testid="instruction-text" />}

      {optionalVideo && video_url && <OptionalVideoButton src={video_url} onUnplayable={() => setFailedSrc(video_url)} />}

      {image_url && <InstructionImage src={image_url} alt={description ?? text ?? 'instruction'} />}

      {video_url && !optionalVideo && <InstructionVideo src={video_url} />}

      {audio_url && (
        <audio src={audio_url} controls className="w-full" data-testid="instruction-audio" />
      )}

      {description && !image_url && (
        <RichText text={description} muted data-testid="instruction-description" />
      )}
    </div>
  );
}
