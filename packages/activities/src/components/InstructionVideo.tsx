/**
 * O vídeo da instrução — o mesmo bloco que o `concept`, o `video` e qualquer
 * kind com `instruction.video_url` desenham.
 *
 * `<video src>` toca ARQUIVO, não PÁGINA de vídeo. Um link do YouTube colado no
 * campo dá tela preta muda: o elemento falha silenciosamente e o professor
 * descobre em aula, na frente da turma. Como esse é o link que um autor tem à
 * mão, o host conhecido é reconhecido ANTES de tentar tocar, e o painel vira um
 * cartão que abre em nova aba — a mesma saída que o `onError` dá pra qualquer
 * outra URL que não toque.
 *
 * O campo é conteúdo autorado no banco, então ele chega aqui como URL ARBITRÁRIA:
 * só `http`/`https` viram player ou link. Sem essa trava, um `javascript:` cai no
 * `onError` e reaparece como `href` de um link que o aluno clica.
 */
import { useState } from 'react';
import { ExternalLink, Video as VideoIcon } from 'lucide-react';
import { useActivityI18n } from '../context.js';
import { MEDIA_LIFT } from './mediaLift.js';

/** Páginas de vídeo (não arquivos) que um autor cola por reflexo. */
const PAGE_HOSTS = [
  'youtube.com',
  'youtu.be',
  'vimeo.com',
  'drive.google.com',
  'loom.com',
  'dailymotion.com',
];

function isVideoPage(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return PAGE_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

function isWebUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}

export function InstructionVideo({
  src,
  height = 'h-72',
  maxHeight = 'max-h-96',
}: {
  src: string;
  height?: string;
  maxHeight?: string;
}) {
  const { t } = useActivityI18n();
  // A troca de atividade reaproveita esta instância na mesma posição da árvore:
  // sem zerar por `src`, um link quebrado condena o vídeo seguinte ao cartão.
  const [media, setMedia] = useState({ src, loaded: false, failed: false });
  if (media.src !== src) setMedia({ src, loaded: false, failed: false });
  const { loaded, failed } = media.src === src ? media : { loaded: false, failed: false };

  if (!isWebUrl(src)) {
    return (
      <div
        className="flex items-center gap-3 rounded-2xl border border-border bg-obsidiana/60 px-4 py-5 text-sm text-muted-foreground"
        data-testid="instruction-video-invalid"
      >
        <VideoIcon className="h-5 w-5 shrink-0 text-menta" aria-hidden />
        <span>{t('activity.video.missing')}</span>
      </div>
    );
  }

  if (failed || isVideoPage(src)) {
    return (
      <a
        href={src}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-3 rounded-2xl border border-border bg-obsidiana/60 px-4 py-5 text-sm text-foreground transition-colors hover:border-menta"
        data-testid="instruction-video-external"
      >
        <VideoIcon className="h-5 w-5 shrink-0 text-menta" aria-hidden />
        <span className="flex-1 text-muted-foreground">
          {t('activity.video.external')}{' '}
          {/* O link tira o aluno da plataforma — ele merece ver pra onde vai. */}
          <span className="font-mono text-xs text-foreground">{new URL(src).hostname}</span>
        </span>
        <span className="inline-flex items-center gap-1.5 font-semibold text-menta">
          {t('activity.video.open')}
          <ExternalLink className="h-4 w-4" aria-hidden />
        </span>
      </a>
    );
  }

  return (
    <div
      className={`rounded-2xl border border-border bg-obsidiana/60 overflow-hidden ${MEDIA_LIFT}`}
      data-testid="instruction-video"
    >
      {!loaded && (
        <div
          className={`w-full ${height} animate-pulse bg-muted-foreground/10`}
          aria-hidden="true"
          data-testid="media-skeleton"
        />
      )}
      <video
        src={src}
        controls
        className={`w-full ${maxHeight} bg-black transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0 h-0'}`}
        onLoadedMetadata={() => setMedia({ src, loaded: true, failed: false })}
        onError={() => setMedia({ src, loaded: false, failed: true })}
      />
    </div>
  );
}
