import { LivesBoundary } from '@/components/lives/LivesBoundary';
import { TeraOutfit } from '@/components/tera/TeraOutfit';
import { useCompanion } from '@/hooks/useCompanion';

function Face() {
  const { outfit } = useCompanion();
  return (
    <span className="shrink-0" data-testid="hero-tera">
      <TeraOutfit mood="neutral" size="bar" outfit={outfit} />
    </span>
  );
}

/** The learner's Tera wearing the equipped outfit; renders nothing where the companion is unavailable. */
export function HeroTera() {
  return (
    <LivesBoundary>
      <Face />
    </LivesBoundary>
  );
}
