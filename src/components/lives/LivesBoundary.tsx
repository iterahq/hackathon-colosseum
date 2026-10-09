import { Component, type ReactNode } from 'react';

/**
 * Lives are a bonus layer: if anything in them throws (no auth, no query client, a broken backend)
 * this renders nothing and the host surface stays exactly what it was before lives existed.
 */
export class LivesBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error) {
    console.warn('[lives] disabled on this surface:', error.message);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}
