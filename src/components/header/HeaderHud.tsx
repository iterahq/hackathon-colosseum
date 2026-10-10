import { HeaderLives } from './HeaderLives';

/** The header keeps one piece of game state: the lives chip. Streak, XP and achievements live in the dashboard welcome strip. */
export function HeaderHud() {
  return (
    <div data-testid="header-hud">
      <HeaderLives />
    </div>
  );
}
