import { FOCUS_SOL_ONLY_SHOP } from '@/config/focus';
import { CrystalChip } from '@/components/crystals/CrystalChip';
import { HeaderLives } from './HeaderLives';

/** The game state folded into one compact control: the lives, and on the full build the crystals beside them, behind the progress story. */
export function HeaderHud() {
  return (
    <div data-testid="header-hud" className="hd-pocket flex h-11 items-center rounded-full border border-[#262320] bg-[#141210] empty:hidden">
      <HeaderLives />
      {!FOCUS_SOL_ONLY_SHOP && (
        <div className="max-sm:hidden">
          <CrystalChip />
        </div>
      )}
    </div>
  );
}
