import { Eraser, Pencil, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/i18n';
import { ANNOTATION_STROKE_CLASS } from '@/consts/annotationStroke';
import {
  ANNOTATION_COLORS,
  type AnnotationColor,
  type AnnotationTool,
} from '@/types/liveAnnotation';

/**
 * A caneta do professor: escolher a ferramenta, a ponta, e varrer o quadro.
 *
 * ## Borracha E limpar, e não uma só
 *
 * Todo traço some sozinho segundos depois que a caneta levanta, então dá para
 * argumentar que a borracha é supérflua — e o argumento está errado no caso que
 * importa. Quando o professor erra o traço no meio da frase, esperar o relógio é
 * ficar com o erro na tela da turma durante a explicação inteira. A borracha tira
 * O traço; `limpar` varre TUDO de uma vez, que é outro gesto: ele acontece quando
 * o quadro poluiu, não quando uma linha saiu torta.
 *
 * ## A ferramenta escolhida DESLIGA o ponteiro
 *
 * Não é economia de tela, é orçamento: `hz × (sala+1)` já come 60 das 100
 * mensagens/s do projeto, e estourar isso DESCONECTA a turma. Com caneta ou
 * borracha na mão a PONTA dela é o ponteiro, então o cursor do professor sai do
 * fio e a taxa total não muda. Quem impõe isso é a página (`tool` desliga a
 * captura de cursor) — aqui só se declara o estado.
 */
export function LiveAnnotationToolbar({
  tool,
  color,
  onTool,
  onColor,
  onClear,
}: {
  /** `null` = mão livre: o ponteiro volta a atravessar para o editor por baixo. */
  tool: AnnotationTool | null;
  color: AnnotationColor;
  onTool: (tool: AnnotationTool | null) => void;
  onColor: (color: AnnotationColor) => void;
  onClear: () => void;
}) {
  const { t } = useI18n();
  const toolButton = 'flex h-8 w-8 items-center justify-center rounded-md transition-colors';
  const toolState = (on: boolean) =>
    on ? 'bg-evergreen/20 text-evergreen-hi' : 'text-brand-muted hover:text-ink';

  return (
    <div
      data-testid="live-annotation-toolbar"
      className="flex items-center gap-1 rounded-lg border border-white/10 bg-panel-2/80 p-1"
    >
      <button
        type="button"
        data-testid="live-annotation-arm"
        aria-pressed={tool === 'pen'}
        onClick={() => onTool(tool === 'pen' ? null : 'pen')}
        title={t('live.annotation.pen')}
        className={cn(toolButton, toolState(tool === 'pen'))}
      >
        <Pencil className="h-4 w-4" />
        <span className="sr-only">{t('live.annotation.pen')}</span>
      </button>

      <button
        type="button"
        data-testid="live-annotation-eraser"
        aria-pressed={tool === 'eraser'}
        onClick={() => onTool(tool === 'eraser' ? null : 'eraser')}
        title={t('live.annotation.eraser')}
        className={cn(toolButton, toolState(tool === 'eraser'))}
      >
        <Eraser className="h-4 w-4" />
        <span className="sr-only">{t('live.annotation.eraser')}</span>
      </button>

      {ANNOTATION_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          data-testid={`live-annotation-color-${c}`}
          aria-pressed={tool === 'pen' && color === c}
          onClick={() => {
            onColor(c);
            // Escolher cor é gesto de quem vai desenhar: pega a caneta mesmo que
            // a borracha esteja na mão.
            onTool('pen');
          }}
          title={t(`live.annotation.color.${c}`)}
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-md transition-colors',
            tool === 'pen' && color === c ? 'bg-white/10' : 'hover:bg-white/5'
          )}
        >
          <svg className="h-4 w-4" viewBox="0 0 16 16" aria-hidden>
            <circle cx="8" cy="8" r="5" className={ANNOTATION_STROKE_CLASS[c]} strokeWidth={5} />
          </svg>
          <span className="sr-only">{t(`live.annotation.color.${c}`)}</span>
        </button>
      ))}

      <button
        type="button"
        data-testid="live-annotation-clear"
        onClick={onClear}
        title={t('live.annotation.clear')}
        className={cn(toolButton, 'text-brand-muted hover:text-ink')}
      >
        <Trash2 className="h-4 w-4" />
        <span className="sr-only">{t('live.annotation.clear')}</span>
      </button>
    </div>
  );
}
