/**
 * Shared Storybook decorators for the atomic-design story structure.
 *
 * `withActivityWidth` — wraps every activity story in a fixed-width
 * centered container matching the real player layout (640 px max-width).
 * Apply in the story meta `decorators` field; don't add it to preview.tsx
 * globally (non-activity organisms use their own sizing).
 */
import React from 'react';
import type { Decorator } from '@storybook/react';

export const withActivityWidth: Decorator = (Story) => (
  <div style={{ maxWidth: 640, width: '100%', margin: '0 auto' }}>
    <Story />
  </div>
);
