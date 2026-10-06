import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BookOpen } from 'lucide-react';
import { ActivityShell } from './parts.js';
import { TeraMentionProvider } from './teraPresence.js';

const shell = (text: string, mascot?: 'none') =>
  render(
    <TeraMentionProvider spec={{ instruction: { text } }}>
      <ActivityShell kind="single_choice" icon={BookOpen} label="Choice" mascot={mascot}>
        <p>{text}</p>
      </ActivityShell>
    </TeraMentionProvider>,
  );

describe('Tera on the activity card', () => {
  it('keeps room beside him so the first lines of text wrap instead of running under him', () => {
    shell('O Tera escreveu 3 linhas.');
    const room = screen.getByTestId('tera-presence-room');
    expect(screen.getByTestId('tera-presence')).toBeInTheDocument();
    expect(room.className).toContain('float-right');
    expect(room.nextElementSibling?.textContent).toBe('O Tera escreveu 3 linhas.');
  });

  it('draws neither him nor his room when the activity does not mention him', () => {
    shell('Qual linha está quebrada?');
    expect(screen.queryByTestId('tera-presence')).toBeNull();
    expect(screen.queryByTestId('tera-presence-room')).toBeNull();
  });

  it('draws neither when the kind opts out of the mascot', () => {
    shell('O Tera escreveu 3 linhas.', 'none');
    expect(screen.queryByTestId('tera-presence-room')).toBeNull();
  });
});
