/**
 * O card amigável de **spec inválido** — estado de borda **F** da matriz do
 * plano `20260728-itera-activity-testing`.
 *
 * UMA convenção só, para os 11 kinds: `code` e `sandbox_scenario` já tinham
 * este card (testids `code-invalid` / `sandbox-invalid`, dos quais testes e o
 * e2e dependem), então a fronteira nova ESTENDE o padrão existente em vez de
 * inventar um segundo. Além do testid por kind, todo card carrega
 * `data-invalid-spec="true"` — o gancho GENÉRICO que um teste de cobertura usa
 * para varrer os 11 kinds sem precisar de uma lista de testids à mão.
 *
 * Arquivo próprio (e não dentro do `ActivityRenderer`) porque o
 * `CodeSnackActivity` também o usa, e o renderer importa o CodeSnack — juntos
 * no mesmo módulo fecharia um ciclo de import.
 */
import { useI18n } from '@/i18n';

export function InvalidSpecCard({
  kind,
  testId,
  messageKey,
}: {
  /** O kind da activity — vai para `data-activity-kind`, como nos demais cards. */
  kind: string;
  /** testid por kind (`quiz-invalid`, `code-invalid`, `sandbox-invalid`, …). */
  testId: string;
  /** Chave i18n da mensagem exibida. */
  messageKey: string;
}) {
  const { t } = useI18n();
  return (
    <div
      className="rounded-3xl border border-border bg-card p-8 text-center text-muted-foreground"
      data-testid={testId}
      data-activity-kind={kind}
      data-invalid-spec="true"
    >
      {t(messageKey)}
    </div>
  );
}

export default InvalidSpecCard;
