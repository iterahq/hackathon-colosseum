import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '@/i18n';
import { InspectActivity } from '@/components/branded/activity/InspectActivity';
import { XrayActivity } from '@/components/branded/activity/XrayActivity';
import { makeActivity } from '@/stories/activityFixtures';
import { INSPECT_SPEC, XRAY_SPEC } from '@/stories/contractFixtures';

/**
 * The scene gestures are pointer gestures, and the "Continuar" that used to
 * stand in for them is gone — so the keyboard path has to complete the SAME
 * gate. Same completion event, same `useSceneGate`, no second behaviour.
 */

afterEach(() => vi.restoreAllMocks());

describe('inspect — keyboard path', () => {
  it('makes every twin a focusable, named button', () => {
    render(
      <I18nProvider>
        <InspectActivity activity={makeActivity('inspect', INSPECT_SPEC)} onComplete={vi.fn()} />
      </I18nProvider>,
    );
    const targets = [...screen.getAllByTestId('inspect-page-target'), ...screen.getAllByTestId('inspect-code-target')];
    expect(targets.length).toBeGreaterThan(0);
    for (const target of targets) {
      expect(target.getAttribute('role')).toBe('button');
      expect(target.getAttribute('tabindex')).toBe('0');
      expect((target.getAttribute('aria-label') ?? '').length).toBeGreaterThan(0);
      expect(target.getAttribute('aria-label')).not.toMatch(/\{name\}|activity\./);
    }
  });

  it('Enter and Space discover a piece; Space does not scroll the page', () => {
    const onComplete = vi.fn();
    render(
      <I18nProvider>
        <InspectActivity activity={makeActivity('inspect', INSPECT_SPEC)} onComplete={onComplete} />
      </I18nProvider>,
    );
    const pageTargets = screen.getAllByTestId('inspect-page-target');
    expect(fireEvent.keyDown(pageTargets[0], { key: ' ' })).toBe(false);
    expect(screen.getByTestId('inspect-chips').getAttribute('data-found')).toBe('1');
    expect(onComplete).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getAllByTestId('inspect-code-target')[1], { key: 'Enter' });
    expect(screen.getByTestId('inspect-chips').getAttribute('data-found')).toBe('2');
    fireEvent.keyDown(pageTargets[0], { key: 'a' });
    expect(screen.getByTestId('inspect-chips').getAttribute('data-found')).toBe('2');
    for (const target of pageTargets) fireEvent.keyDown(target, { key: 'Enter' });
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0][0]).toBe(true);
  });
});

describe('xray — keyboard path', () => {
  it('sweeps the lens with the arrow keys and opens the gate once', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 1400,
      bottom: 900,
      width: 1400,
      height: 900,
      toJSON: () => ({}),
    });
    const onComplete = vi.fn();
    render(
      <I18nProvider>
        <XrayActivity activity={makeActivity('xray', XRAY_SPEC)} onComplete={onComplete} />
      </I18nProvider>,
    );
    const stage = screen.getByTestId('xray-stage');
    expect(stage.getAttribute('tabindex')).toBe('0');
    expect((stage.getAttribute('aria-label') ?? '').length).toBeGreaterThan(0);
    expect(fireEvent.keyDown(stage, { key: 'Tab' })).toBe(true);

    const sweep = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowDown'];
    for (let i = 0; i < 120 && onComplete.mock.calls.length === 0; i++) {
      const key = sweep[Math.floor(i / 6) % sweep.length];
      expect(fireEvent.keyDown(stage, { key })).toBe(false);
    }
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0][0]).toBe(true);
    expect(screen.getByTestId('scene-stamp')).toBeTruthy();
  });

  it('does nothing on arrows before the stage has an area to sweep', () => {
    const onComplete = vi.fn();
    render(
      <I18nProvider>
        <XrayActivity activity={makeActivity('xray', XRAY_SPEC)} onComplete={onComplete} />
      </I18nProvider>,
    );
    fireEvent.keyDown(screen.getByTestId('xray-stage'), { key: 'ArrowRight' });
    expect(onComplete).not.toHaveBeenCalled();
  });
});
