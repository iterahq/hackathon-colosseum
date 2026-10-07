import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { bridgeReport, startShellBridge } from './shellBridge';

const KEEP_AWAKE_ROUTE = /^\/(lesson\/[^/]+|live(\/.*)?)\/?$/;

/** Routes where the phone screen stays on: a lesson and a live class (PLAN R-8). */
export function wantsKeepAwake(pathname: string): boolean {
  return KEEP_AWAKE_ROUTE.test(pathname);
}

/**
 * The one call site of `keepAwake`, driven by the router: mounted once beside `ShellBridgeMount`.
 * Entering a route of `wantsKeepAwake` asks the shell to hold the screen; leaving it, or unmounting,
 * releases it. In a browser tab the handshake settles at `no_shell`, so nothing is sent. The Screen
 * Wake Lock API is out of scope: this changes behaviour inside the shell only.
 */
export function KeepAwakeRouteMount(): null {
  const wanted = wantsKeepAwake(useLocation().pathname);
  useEffect(() => {
    if (!wanted) return undefined;
    const client = startShellBridge();
    if (!client) return undefined;
    let cancelled = false;
    let asked = false;
    const report = (error: unknown) => bridgeReport.failure('keepAwake', error);
    // Any accepted hello makes the shell release the wake lock: after a renewal the wish is asked again.
    const offRenewed = client.onRenewed(() => {
      if (asked && !cancelled) void client.call('keepAwake', { on: true }).catch(report);
    });
    void client
      .handshake()
      .then(() => {
        if (cancelled || !client.has('keepAwake')) return undefined;
        asked = true;
        return client.call('keepAwake', { on: true });
      })
      .catch(report);
    return () => {
      cancelled = true;
      offRenewed();
      if (asked) void client.call('keepAwake', { on: false }).catch(report);
    };
  }, [wanted]);
  return null;
}
