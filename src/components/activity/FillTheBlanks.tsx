import { Check, ChevronDown, ChevronUp, Eye, Lightbulb } from 'lucide-react';
import { Activity } from '@/types';
import { ActivityGameCard, GameButton } from '@/components/game';
import { cn } from '@/lib/utils';
import { tokenizeCode, useFillTheBlanks } from '@/hooks/useFillTheBlanks';
import { useI18n } from '@/i18n';

export { useFillTheBlanks };

interface FillTheBlanksProps {
    activity: Activity;
    onSubmit: (filledCode: string, isCorrect: boolean) => void;
}

export function FillTheBlanks({ activity, onSubmit }: FillTheBlanksProps) {
    const { t } = useI18n();
    const {
        blanks,
        codeLines,
        answers,
        statuses,
        showPreview,
        setShowPreview,
        filledCode,
        allFilled,
        hasValidatedAnswers,
        allCorrect,
        handleChange,
        handleSubmit,
    } = useFillTheBlanks(activity, { onSubmit });

    return (
        <ActivityGameCard
            type={activity.type}
            title={activity.title}
            question={activity.instructions || activity.objective}
            actions={
                <div className="flex flex-wrap items-center justify-end gap-3">
                    <button
                        type="button"
                        onClick={() => setShowPreview((current) => !current)}
                        className="inline-flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                        <Eye className="h-4 w-4" />
                        {showPreview ? t('activity.blanks.hidePreview') : t('activity.blanks.showPreview')}
                        {showPreview ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>

                    <GameButton
                        onClick={handleSubmit}
                        disabled={!allFilled}
                        variant="primary"
                        icon={<Check className="h-5 w-5" />}
                    >
                        {t('activity.action.validateCode')}
                    </GameButton>
                </div>
            }
        >
            <div className="flex flex-1 flex-col gap-4 overflow-hidden">
                <div className="flex flex-wrap items-center gap-2">
                    {blanks.map((blank, index) => (
                        <div
                            key={blank.id}
                            className="flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs"
                            style={{
                                borderColor: 'hsl(var(--warning) / 0.3)',
                                background: 'hsl(var(--warning) / 0.12)',
                                color: 'hsl(var(--warning-foreground) / 0.96)',
                            }}
                        >
                            <Lightbulb className="h-3.5 w-3.5" />
                            <span>{t('activity.blanks.blankLabel', { n: String(index + 1) })}</span>
                            <span style={{ color: 'hsl(var(--warning-foreground) / 0.7)' }}>{t('activity.blanks.lineLabel', { n: String(blank.line) })}</span>
                            {blank.hint ? (
                                <span style={{ color: 'hsl(var(--foreground) / 0.72)' }}>{blank.hint}</span>
                            ) : null}
                        </div>
                    ))}
                </div>

                <div
                    className="overflow-hidden rounded-[1.75rem] border"
                    style={{
                        borderColor: 'hsl(215 32% 18%)',
                        background:
                            'radial-gradient(circle at top, hsl(var(--primary) / 0.08), transparent 32%), linear-gradient(180deg, hsl(215 55% 10%), hsl(224 57% 8%))',
                        boxShadow: '0 24px 80px rgba(2, 6, 23, 0.45)',
                    }}
                >
                    <div
                        className="border-b px-4 py-3 font-mono text-[11px] uppercase tracking-[0.3em]"
                        style={{
                            borderColor: 'hsl(215 32% 18%)',
                            background: 'hsl(222 47% 8% / 0.82)',
                            color: 'hsl(215 20% 68%)',
                        }}
                    >
                        {t('activity.blanks.title')}
                    </div>

                    <div className="custom-scrollbar max-h-[420px] overflow-auto py-2">
                        <div className="min-w-max font-mono text-[14px] leading-7 text-foreground">
                            {codeLines.map((segments, lineIndex) => (
                                <div
                                    key={`line-${lineIndex + 1}`}
                                    className="grid items-start px-4"
                                    style={{ gridTemplateColumns: '56px minmax(0, 1fr)' }}
                                >
                                    <div className="select-none pr-4 text-right" style={{ color: 'hsl(215 16% 45%)' }}>
                                        {lineIndex + 1}
                                    </div>

                                    <div className="whitespace-pre-wrap break-words">
                                        {segments.map((segment, segmentIndex) => {
                                            if (segment.type === 'text') {
                                                return tokenizeCode(segment.value).map((token, tokenIndex) => (
                                                    <span
                                                        key={`text-${segmentIndex}-${tokenIndex}`}
                                                        className={token.className}
                                                    >
                            {token.value}
                          </span>
                                                ));
                                            }

                                            const blank = segment.blank;
                                            const value = answers[blank.id] ?? '';
                                            const status = statuses[blank.id] ?? 'idle';
                                            const sharedClassName = 'mx-1 inline-flex min-w-[88px] align-middle';

                                            if (blank.options?.length) {
                                                return (
                                                    <span key={blank.id} className={sharedClassName}>
                            <select
                                value={value}
                                onChange={(event) => handleChange(blank.id, event.target.value)}
                                className={cn(
                                    'h-9 w-full rounded-xl border px-3 font-mono text-[13px] outline-none transition-colors focus:border-primary focus:ring-4 focus:ring-primary/20',
                                    status === 'correct'
                                        ? 'border-success bg-success/85 text-success-foreground'
                                        : status === 'incorrect'
                                            ? 'border-destructive bg-destructive/85 text-destructive-foreground'
                                            : 'border-warning/70 bg-warning/90 text-primary-foreground'
                                )}
                            >
                              <option value="">{t('activity.blanks.select')}</option>
                                {blank.options.map((option) => (
                                    <option key={option} value={option}>
                                        {option}
                                    </option>
                                ))}
                            </select>
                          </span>
                                                );
                                            }

                                            return (
                                                <input
                                                    key={blank.id}
                                                    value={value}
                                                    onChange={(event) => handleChange(blank.id, event.target.value)}
                                                    placeholder="..."
                                                    className={cn(
                                                        sharedClassName,
                                                        'h-9 rounded-xl border px-3 font-mono text-[13px] outline-none transition-colors placeholder:text-primary-foreground/55 focus:border-primary focus:ring-4 focus:ring-primary/20',
                                                        status === 'correct'
                                                            ? 'border-success bg-success/85 text-success-foreground'
                                                            : status === 'incorrect'
                                                                ? 'border-destructive bg-destructive/85 text-destructive-foreground'
                                                                : 'border-warning/70 bg-warning/90 text-primary-foreground'
                                                    )}
                                                />
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {blanks.map((blank, index) => {
                        const status = statuses[blank.id] ?? 'idle';
                        const answer = answers[blank.id] ?? '';

                        return (
                            <div
                                key={blank.id}
                                className={cn(
                                    'rounded-2xl border px-4 py-3',
                                    status === 'correct' && 'border-success/40 bg-success/10',
                                    status === 'incorrect' && 'border-destructive/40 bg-destructive/10',
                                    status === 'idle' && 'border-border bg-card/70'
                                )}
                            >
                                <div className="mb-1 text-sm font-semibold text-foreground">{t('activity.blanks.blankLabel', { n: String(index + 1) })}</div>
                                <div className="text-xs text-muted-foreground">
                                    {blank.hint || t('activity.blanks.lineLabelCap', { n: String(blank.line) })}
                                </div>
                                {status === 'correct' ? (
                                    <div className="mt-2 text-sm text-success">{t('activity.blanks.correct')}</div>
                                ) : null}
                                {status === 'incorrect' ? (
                                    <div className="mt-2 text-sm text-destructive-foreground">
                                        {t('activity.blanks.incorrectExpected')} <code>{blank.correctAnswer}</code>
                                    </div>
                                ) : null}
                                {status === 'idle' && answer ? (
                                    <div className="mt-2 text-sm text-warning">{t('activity.blanks.filledWaiting')}</div>
                                ) : null}
                            </div>
                        );
                    })}
                </div>

                {showPreview ? (
                    <div className="rounded-[1.75rem] border border-primary/20 bg-card/80 p-4">
                        <div className="mb-3 flex items-center justify-between">
                            <div>
                                <div className="text-sm font-semibold text-foreground">{t('activity.blanks.previewTitle')}</div>
                                <div className="text-xs text-muted-foreground">
                                    {allCorrect
                                        ? t('activity.blanks.allCorrect')
                                        : t('activity.blanks.fillToCheck')}
                                </div>
                            </div>
                        </div>
                        <pre className="custom-scrollbar overflow-auto rounded-2xl bg-[#0d1424] p-4 font-mono text-sm leading-6 text-foreground">
              <code>{filledCode}</code>
            </pre>
                    </div>
                ) : null}

                {hasValidatedAnswers && !allCorrect ? (
                    <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive-foreground">
                        {t('activity.blanks.someIncorrect')}
                    </div>
                ) : null}
            </div>
        </ActivityGameCard>
    );
}
