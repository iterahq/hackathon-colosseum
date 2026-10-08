import { RouteSettling } from '@/components/RouteSettling';

/** Shown inside the shell for the moment between the first paint and the bridge `HelloAck`. */
export function ShellSettling() {
  return <RouteSettling testId="shell-settling" />;
}
