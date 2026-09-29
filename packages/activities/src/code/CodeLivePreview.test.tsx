import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CodeLivePreview } from './CodeLivePreview.js';

describe('CodeLivePreview — language css', () => {
  it('renders the stylesheet over a sample page instead of transpiling it', () => {
    render(<CodeLivePreview code={'.menu {\n  display: flex;\n}\n'} language="css" />);
    const frame = screen.getByTestId('code-preview-iframe') as HTMLIFrameElement;
    const srcDoc = frame.getAttribute('srcdoc') ?? '';
    expect(srcDoc).toContain('display: flex;');
    expect(srcDoc).toContain('class="menu"');
    expect(screen.queryByTestId('code-preview-error')).toBeNull();
  });
});
