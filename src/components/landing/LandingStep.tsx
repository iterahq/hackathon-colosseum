import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { FOCUS, LABEL, PANEL } from '@/components/world/worldStyles';

export function LandingStep({ label, title, body, accent, link, children }: { label: string; title: string; body: string; accent: string; link?: { to: string; label: string }; children?: ReactNode }) {
  return (
    <li className={`${PANEL} flex flex-col gap-3 p-6`} data-testid="landing-step">
      <span className={LABEL} style={{ color: accent }}>
        {label}
      </span>
      <h2 className="[font:700_26px/1.05_'Barlow_Condensed'] text-[#F4EDE2]">{title}</h2>
      <p className="[font:400_15px/1.5_Inter] text-[#C9BFB0]">{body}</p>
      {children}
      {link && (
        <Link to={link.to} className={`mt-auto inline-flex min-h-11 items-center rounded [font:600_13px_JetBrains_Mono] text-[#F4EDE2] hover:text-[#3FD17F] ${FOCUS}`} data-testid="landing-step-link">
          {link.label} →
        </Link>
      )}
    </li>
  );
}
