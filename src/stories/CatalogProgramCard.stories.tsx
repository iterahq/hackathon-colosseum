import type { Meta, StoryObj } from '@storybook/react-vite';
import { ArrowRight, CheckCircle2, Lock } from 'lucide-react';
import { CatalogProgramCard } from '@/components/branded/CatalogProgramCard';

/**
 * The v3 catalog card (promoted from design-playground PR #495, "Proposta
 * v3") — the shared presentational card behind both `CatalogCard` (member)
 * and `LockedCatalogCard` (visitor). These stories exercise the `action`
 * slot with the same CTA markup the two real callers render.
 */
const program = {
  id: 'c-agente',
  title: {
    pt: 'Domínio → Agente: de analista a arquiteto agêntico',
    en: 'Domain → Agent: from analyst to agentic architect',
  },
  unitCount: 3,
  lessonCount: 6,
  activityCount: 21,
  icon: 'layers',
};

const meta: Meta<typeof CatalogProgramCard> = {
  title: 'Branded/CatalogProgramCard',
  component: CatalogProgramCard,
  render: (args) => (
    <div style={{ maxWidth: 340 }}>
      <CatalogProgramCard {...args} />
    </div>
  ),
};
export default meta;
type Story = StoryObj<typeof CatalogProgramCard>;

const enrollButton = (
  <button
    type="button"
    className="w-full inline-flex items-center justify-center gap-2 h-10 px-5 rounded-full bg-evergreen text-obsidiana font-medium hover:bg-evergreen-hi transition-colors disabled:opacity-50"
  >
    Matricular <ArrowRight className="w-4 h-4" />
  </button>
);

const enrollingButton = (
  <button
    type="button"
    disabled
    className="w-full inline-flex items-center justify-center gap-2 h-10 px-5 rounded-full bg-evergreen text-obsidiana font-medium disabled:opacity-50"
  >
    Matriculando…
  </button>
);

const openButton = (
  <button
    type="button"
    className="w-full inline-flex items-center justify-center gap-2 h-10 px-5 rounded-full border border-evergreen/40 bg-evergreen-soft text-evergreen-hi font-medium hover:bg-evergreen-soft/70 transition-colors"
  >
    <CheckCircle2 className="w-4 h-4" /> Abrir curso
  </button>
);

const subscribeLink = (
  <span className="w-full inline-flex items-center justify-center gap-2 h-10 px-5 rounded-full bg-evergreen text-obsidiana font-medium">
    <Lock className="w-4 h-4" /> Assine para desbloquear <ArrowRight className="w-4 h-4" />
  </span>
);

/** Member, not yet enrolled — Enroll CTA. */
export const Member: Story = { args: { program, action: enrollButton } };

/** Member, already enrolled — Open CTA, thumbnail opens the course. */
export const Enrolled: Story = {
  args: { program, action: openButton, onOpenThumbnail: () => {} },
};

/** Member, mid-enroll — pending CTA. */
export const Enrolling: Story = { args: { program, action: enrollingButton } };

/** Visitor — lock badge over the thumbnail + Subscribe CTA. */
export const Locked: Story = {
  args: { program, action: subscribeLink, locked: true, onOpenThumbnail: () => {} },
};
