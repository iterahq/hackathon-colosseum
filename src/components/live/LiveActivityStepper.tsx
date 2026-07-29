import { useI18n } from '@/i18n';

export function LiveActivityStepper({ index, count }: { index: number; count: number }) {
  const { t } = useI18n();

  return (
    <div className="px-5 pt-4 pb-1" data-testid="live-position" data-index={index + 1} data-count={count}>
      <div className="flex items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {t('live.stepper.label')}
        </span>
        <span className="ml-auto font-mono text-sm tabular-nums text-foreground">
          {index + 1}/{count}
        </span>
      </div>
      <div className="mt-2 flex items-center gap-1" aria-hidden>
        {Array.from({ length: count }, (_, i) => (
          <span
            key={i}
            className={`h-1 flex-1 rounded-full ${
              i < index ? 'bg-evergreen/50' : i === index ? 'bg-evergreen' : 'bg-muted'
            }`}
          />
        ))}
      </div>
    </div>
  );
}
