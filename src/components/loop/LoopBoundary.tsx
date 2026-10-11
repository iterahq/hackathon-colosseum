import { Component, type ReactNode } from 'react';

/** A failure inside the loop panel renders nothing: the lesson end and the ceremony above it must never pay for it. */
export class LoopBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error) {
    console.error('[loop] panel failed:', error.message);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}
