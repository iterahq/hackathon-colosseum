import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ShellSurface } from '@/lib/shellSurface';
import { WebOnly } from './WebOnly';

const surface = vi.hoisted(() => ({ value: 'web' as ShellSurface }));
vi.mock('@/hooks/useShellSurface', () => ({ useShellSurface: () => surface.value }));

describe('WebOnly', () => {
  it.each([
    ['web', true],
    ['pending', false],
    ['shell', false],
  ] as const)('surface %s renders children: %s', (value, shown) => {
    surface.value = value;
    render(
      <WebOnly>
        <a href="/subscribe">Assinar</a>
      </WebOnly>,
    );
    expect(screen.queryByText('Assinar') !== null).toBe(shown);
  });
});
