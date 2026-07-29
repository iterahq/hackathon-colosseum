/**
 * Espelha a moldura real da atividade (mesmo raio, borda e respiro) de
 * propósito: qualquer divergência aqui vira pulo de layout quando o conteúdo
 * chega.
 */
export function ActivitySkeleton() {
  return (
    <div
      className="rounded-3xl border border-border bg-card p-6 md:p-8"
      data-testid="live-activity-skeleton"
      aria-busy="true"
    >
      <div className="h-6 w-28 rounded-full ds-shimmer" />
      <div className="mt-5 h-6 w-3/4 rounded-lg ds-shimmer" />
      <div className="mt-2.5 h-6 w-1/2 rounded-lg ds-shimmer" />
      <div className="mt-6 space-y-3">
        <div className="h-12 rounded-2xl ds-shimmer" />
        <div className="h-12 rounded-2xl ds-shimmer" />
        <div className="h-12 rounded-2xl ds-shimmer" />
      </div>
    </div>
  );
}
