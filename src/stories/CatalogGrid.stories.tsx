import type { Meta, StoryObj } from '@storybook/react-vite';
import { ArrowRight, CheckCircle2, BookOpen } from 'lucide-react';
import { ProgramCard, ProgramIcon } from '@/components/branded';
import type { ProgramCardData } from '@/components/branded/ProgramCard';

/**
 * Catalog grid — visual reference for the /catalog "Catálogo de cursos" surface.
 * `Before` is the old flat card (icon + title + counts + green button); `After`
 * is the shared rich ProgramCard with the Enroll/Open CTA in its footer slot.
 * Catalog programs have no per-user progress → not-started look (no
 * progress bar), which is the graceful-degradation contract.
 */
const programs: (ProgramCardData & { slug: string; alreadyEnrolled: boolean })[] = [
  {
    id: 'p1',
    slug: 'modele-dados-com-ia',
    title: { en: 'Model your data with AI', pt: 'Modele seus dados com IA' },
    unitCount: 1,
    lessonCount: 2,
    activityCount: 8,
    icon: 'brain',
    alreadyEnrolled: false,
  },
  {
    id: 'p2',
    slug: 'frontend-fundamentals',
    title: { en: 'Frontend Fundamentals' },
    unitCount: 3,
    lessonCount: 8,
    activityCount: 18,
    icon: 'code',
    alreadyEnrolled: true,
  },
  {
    id: 'p3',
    slug: 'cloud-on-aws',
    title: { en: 'Cloud Architecture on AWS' },
    unitCount: 2,
    lessonCount: 5,
    activityCount: 6,
    icon: 'cloud',
    alreadyEnrolled: false,
  },
];

const meta: Meta = { title: 'Organisms/CatalogGrid', parameters: { layout: 'fullscreen' } };
export default meta;
type Story = StoryObj;

/** OLD plain catalog card (kept here only as the before-reference). */
function PlainCatalogCard({ p }: { p: (typeof programs)[number] }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <ProgramIcon icon={p.icon} size="md" />
        <div className="min-w-0">
          <h3 className="font-display font-semibold text-foreground leading-tight">
            {p.title.pt ?? p.title.en}
          </h3>
          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-3">
            <span className="inline-flex items-center gap-1">
              <BookOpen className="w-3.5 h-3.5" /> {p.unitCount} unidades
            </span>
            <span>·</span>
            <span>{p.activityCount} atividades</span>
          </p>
        </div>
      </div>
      <button className="mt-auto inline-flex items-center justify-center gap-2 h-10 px-5 rounded-full bg-evergreen text-obsidiana font-medium">
        Abrir curso <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  );
}

export const Before: Story = {
  render: () => (
    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5 max-w-[1400px] mx-auto p-6">
      {programs.map((p) => (
        <PlainCatalogCard key={p.id} p={p} />
      ))}
    </div>
  ),
};

export const After: Story = {
  render: () => (
    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5 max-w-[1400px] mx-auto p-6">
      {programs.map((p) => (
        <ProgramCard
          key={p.id}
          program={p}
          onClick={p.alreadyEnrolled ? () => {} : undefined}
          footer={
            p.alreadyEnrolled ? (
              <button className="w-full inline-flex items-center justify-center gap-2 h-10 px-5 rounded-full border border-evergreen/40 bg-evergreen-soft text-evergreen-hi font-medium">
                <CheckCircle2 className="w-4 h-4" /> Abrir curso
              </button>
            ) : (
              <button className="w-full inline-flex items-center justify-center gap-2 h-10 px-5 rounded-full bg-evergreen text-obsidiana font-medium">
                Matricular <ArrowRight className="w-4 h-4" />
              </button>
            )
          }
        />
      ))}
    </div>
  ),
};
