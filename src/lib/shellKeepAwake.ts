import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { startShellBridge } from './shellBridge';

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
    void client
      .handshake()
      .then(() => {
        if (cancelled || !client.has('keepAwake')) return undefined;
        asked = true;
        return client.call('keepAwake', { on: true });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      if (asked) void client.call('keepAwake', { on: false }).catch(() => undefined);
    };
  }, [wanted]);
  return null;
}
