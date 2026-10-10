/**
 * "Certificações dos alunos" (`/live/instructor/certifications`) — instructor-gated.
 * Lists the minted certifications of the learners the instructor teaches and lets
 * them endorse one: the backend checks the role again and writes the wallet on chain.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { AppTopBar } from '@/components/header/AppTopBar';
import '@/components/dashboard/dashboard.css';
import { EndorseDialog } from '@/components/live/endorse/EndorseDialog';
import { StudentCertificationRow } from '@/components/live/endorse/StudentCertificationRow';
import { useEndorse, useStudentCertifications } from '@/hooks/useEndorsements';
import { useI18n } from '@/i18n';
import type { StudentCertification } from '@/types/endorsement';

export default function InstructorCertificationsPage() {
  const { t } = useI18n();
  const list = useStudentCertifications();
  const endorse = useEndorse();
  const [target, setTarget] = useState<StudentCertification | null>(null);
  const wallet = list.data?.wallet ?? null;
  const certifications = list.data?.certifications ?? [];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="dash-root"><AppTopBar /></div>
      <main className="flex-1 max-w-[900px] w-full mx-auto px-4 md:px-6 py-6 md:py-10">
        <Link to="/live/instructor" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="w-4 h-4" />
          {t('live.report.back')}
        </Link>
        <span className="block text-[13px] uppercase tracking-wider text-clay font-mono">{t('live.instructor.kicker')}</span>
        <h1 className="font-display font-bold text-foreground leading-tight mb-1" data-testid="student-certifications-title">
          {t('endorse.title')}
        </h1>
        <p className="text-sm text-muted-foreground mb-6 max-w-2xl">{t('endorse.subtitle')}</p>

        {list.isSuccess && !wallet && (
          <p className="mb-4 rounded-2xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground" data-testid="endorse-no-wallet">
            {t('endorse.noWallet')}
          </p>
        )}
        {endorse.isError && (
          <p className="mb-4 text-sm text-destructive" role="alert" data-testid="endorse-error">
            {t('endorse.error')}
          </p>
        )}
        {list.isPending ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : list.isError ? (
          <p className="text-sm text-muted-foreground" data-testid="student-certifications-error">
            {t('endorse.loadError')}
          </p>
        ) : certifications.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="student-certifications-empty">
            {t('endorse.empty')}
          </p>
        ) : (
          <ul className="rounded-2xl border border-border bg-card divide-y divide-border" data-testid="student-certifications">
            {certifications.map((certification) => (
              <StudentCertificationRow
                key={certification.id}
                certification={certification}
                busy={endorse.isPending && endorse.variables?.id === certification.id}
                disabled={!wallet || endorse.isPending}
                onEndorse={() => setTarget(certification)}
              />
            ))}
          </ul>
        )}
      </main>
      <EndorseDialog
        target={target}
        wallet={wallet}
        onCancel={() => setTarget(null)}
        onConfirm={(note) => {
          if (target) endorse.mutate({ id: target.id, note });
          setTarget(null);
        }}
      />
    </div>
  );
}
