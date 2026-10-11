import { useSyncExternalStore } from 'react';
import { OfflineLine } from './OfflineLine';

const subscribe = (onChange: () => void) => {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
};
const isOnline = () => (typeof navigator === 'undefined' ? true : navigator.onLine);

/** One line at the top while the browser reports no network. Renders nothing (and reads no context) while online. */
export function OfflineBanner() {
  const online = useSyncExternalStore(subscribe, isOnline, () => true);
  return online ? null : <OfflineLine />;
}
