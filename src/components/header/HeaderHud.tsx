import { CrystalChip } from '@/components/crystals/CrystalChip';
import { HeaderLives } from './HeaderLives';

/** The game state folded into one compact control: lives and crystals side by side in a single pill, behind the progress story. */
export function HeaderHud() {
  return (
    <div data-testid="header-hud" className="hd-pocket flex h-11 items-center rounded-full border border-[#262320] bg-[#141210] empty:hidden">
      <HeaderLives />
      <div className="max-sm:hidden">
        <CrystalChip />
      </div>
    </div>
  );
}
