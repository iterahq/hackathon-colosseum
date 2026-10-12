import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GuidedCodeTemplate } from './GuidedCodeTemplate.js';
import { splitGuidedTemplate } from './guidedCode.js';

function setup(starter: string) {
  render(
    <GuidedCodeTemplate
      lines={splitGuidedTemplate(starter, [])}
      values={{}}
      activeBlankId={null}
      byBlank={null}
      revealed={false}
      readOnly={false}
      onActivate={() => {}}
      onChange={() => {}}
    />,
  );
  return screen.getByTestId('guided-code-template');
}

describe('GuidedCodeTemplate', () => {
  it('does not draw the numbered empty lines a trailing newline leaves', () => {
    const template = setup('<h1>Tera</h1>\n<p>Bolo</p>\n\n');
    expect(template.children).toHaveLength(2);
  });

  it('keeps an empty line that sits between code', () => {
    const template = setup('<h1>Tera</h1>\n\n<p>Bolo</p>');
    expect(template.children).toHaveLength(3);
  });

  it('caps its height on a phone only, so it never scrolls inside the page from md up', () => {
    const classes = setup('<h1>Tera</h1>').className.split(' ');
    const caps = classes.filter((c) => c.includes('max-h-') || c.includes('overflow-y-auto') || c === 'overflow-auto');
    expect(caps.length).toBeGreaterThan(0);
    for (const c of caps) expect(c.startsWith('max-sm:')).toBe(true);
  });
});
