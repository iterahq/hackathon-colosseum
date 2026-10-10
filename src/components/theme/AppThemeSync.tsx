import { useEffect } from 'react';
import { LivesBoundary } from '@/components/lives/LivesBoundary';
import { useCrystals } from '@/hooks/useCrystals';
import { applyTheme, writeCachedTheme } from '@/utils/appTheme';
import '@/styles/appTheme.css';

function Sync() {
  const theme = useCrystals().data?.theme;
  const background = theme?.background.color;
  const icon = theme?.icon.color;
  useEffect(() => {
    if (!theme || !background || !icon) return;
    applyTheme({ background, icon });
    writeCachedTheme(theme);
  }, [theme, background, icon]);
  return null;
}

/** Paints the learner's background and icon colour on the whole app and keeps the first-paint cache fresh. Renders nothing. */
export function AppThemeSync() {
  return (
    <LivesBoundary>
      <Sync />
    </LivesBoundary>
  );
}
