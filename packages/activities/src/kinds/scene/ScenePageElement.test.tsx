import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { ScenePageElement } from './ScenePageElement.js';

describe('ScenePageElement', () => {
  it('lets the page style win over the tag look', () => {
    const { container } = render(
      <ScenePageElement
        element={{ id: 'title', tag: 'h1', text: 'Oi' }}
        style={{ fontSize: '42px', color: 'rgb(255, 0, 0)' }}
      />,
    );
    const el = container.querySelector('[data-scene-tag="h1"]') as HTMLElement;
    expect(el.style.fontSize).toBe('42px');
    expect(el.style.color).toBe('rgb(255, 0, 0)');
  });

  it('keeps the tag look without a page style', () => {
    const { container } = render(<ScenePageElement element={{ id: 'title', tag: 'h1', text: 'Oi' }} />);
    const el = container.querySelector('[data-scene-tag="h1"]') as HTMLElement;
    expect(el.style.color).toBe('rgb(59, 31, 43)');
    expect(el.style.fontWeight).toBe('800');
  });
});
