import { LABEL, PANEL } from '@/components/world/worldStyles';

export function LandingStep({ label, title, body, accent }: { label: string; title: string; body: string; accent: string }) {
  return (
    <li className={`${PANEL} flex flex-col gap-3 p-6`} data-testid="landing-step">
      <span className={LABEL} style={{ color: accent }}>
        {label}
      </span>
      <h2 className="[font:700_26px/1.05_'Barlow_Condensed'] text-[#F4EDE2]">{title}</h2>
      <p className="[font:400_15px/1.5_Inter] text-[#C9BFB0]">{body}</p>
    </li>
  );
}
