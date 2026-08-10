import { describe, expect, it } from 'vitest';
// ⚠️ A DELIBERATE DEEP IMPORT INTO THE PACKAGE SOURCE, not through the barrel —
// same reason as `terminalSuccessMarks.test.ts`: this is package-internal logic
// that the player does not re-export, and testing it through the built `dist`
// would test the build instead of the rule.
import { promptSigil } from '../../packages/activities/src/kinds/terminal/ps1';

/**
 * `promptSigil` is the whole of the mobile prompt fix that is not CSS. Tainan,
 * TG 2026-08-10: *"talvez no mobile mostrar só $ para aparecer o restante do
 * input"*.
 *
 * It is one line of code and it earns a test file because `initialState.ps1` is
 * `z.string()` — the author can put ANY string there, and the guarantee this
 * function has to hold is a width guarantee: whatever comes in, ONE glyph comes
 * out. A helper that returned the trailing path segment would satisfy every
 * example in the current fixture set and still reproduce the bug on the first
 * scenario with a long directory name.
 */
describe('promptSigil — the composer prefix on a phone', () => {
  it('always returns exactly one character, whatever the author wrote', () => {
    for (const ps1 of [
      'aluno@itera:~/meu-site$',
      'aluno@itera:~/projetos/site-do-cliente-com-nome-comprido$',
      'root@itera:/var/www#',
      'aluno@itera ~ %',
      'PS>',
      '',
      'sem sigilo nenhum',
      '~/meu-projeto',
    ]) {
      expect(promptSigil(ps1), `ps1 ${JSON.stringify(ps1)}`).toHaveLength(1);
    }
  });

  it('keeps the sigil the author actually wrote — `#` still says root', () => {
    expect(promptSigil('aluno@itera:~/meu-site$')).toBe('$');
    expect(promptSigil('root@itera:/var/www#')).toBe('#');
    expect(promptSigil('aluno@itera ~ %')).toBe('%');
    expect(promptSigil('PS C:\\>')).toBe('>');
  });

  it('falls back to `$` — the character Tainan asked for — when there is none', () => {
    expect(promptSigil('')).toBe('$');
    expect(promptSigil('~/meu-projeto')).toBe('$');
    expect(promptSigil('bash')).toBe('$');
  });

  it('ignores trailing whitespace rather than falling back through it', () => {
    // A prompt authored as `"aluno@itera:~$ "` (with the customary trailing
    // space) is the same prompt. Reading `slice(-1)` without the trim would
    // silently take the `$` branch away from it.
    expect(promptSigil('aluno@itera:~$ ')).toBe('$');
    expect(promptSigil('root@itera:~# \n')).toBe('#');
  });
});
