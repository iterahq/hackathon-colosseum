import { describe, it, expect } from 'vitest';
import type { CodeBlank, CodeSpec } from '@iterahq/activity-spec';
import { buildWordBank, restoreGuidedValues, spentBankCounts } from '@iterahq/activities/code';

const bank = (id: string, answer: string): CodeBlank => ({ id, kind: 'bank', answer });
const select = (id: string, answer: string, options: string[]): CodeBlank => ({
  id,
  kind: 'select',
  answer,
  options,
});
const text = (id: string, answer: string): CodeBlank => ({ id, kind: 'text', answer });

describe('buildWordBank', () => {
  it('honours a declared word_bank verbatim — the order is a teaching decision', () => {
    const spec = {
      prompt: 'p',
      word_bank: ['onClick', 'useState'],
      blanks: [bank('a', 'useState')],
    } as CodeSpec;
    expect(buildWordBank(spec)).toEqual(['onClick', 'useState']);
  });

  it('derives the pool from the bank blanks when the author declared none', () => {
    const spec = {
      prompt: 'p',
      blanks: [
        { id: 'a', kind: 'bank', answer: 'useState', options: ['useEffect'] },
        bank('b', 'onClick'),
        text('c', 'ignorado'),
      ],
    } as CodeSpec;
    // Ordenado: em ordem de autoria as respostas saíam primeiro e na ordem dos
    // buracos, e o aluno acertava tudo tocando da esquerda pra direita.
    expect(buildWordBank(spec)).toEqual(['onClick', 'useEffect', 'useState']);
  });

  it('gives two holes with the SAME answer two chips — deduping made it unfinishable', () => {
    const spec = { prompt: 'p', blanks: [bank('a', 'const'), bank('b', 'const')] } as CodeSpec;
    expect(buildWordBank(spec)).toEqual(['const', 'const']);
  });

  it('dedupes only distractors — a repeated wrong option is noise, not a slot', () => {
    const spec = {
      prompt: 'p',
      blanks: [
        { id: 'a', kind: 'bank', answer: 'useState', options: ['let'] },
        { id: 'b', kind: 'bank', answer: 'onClick', options: ['let'] },
      ],
    } as CodeSpec;
    expect(buildWordBank(spec)).toEqual(['let', 'onClick', 'useState']);
  });
});

describe('spentBankCounts', () => {
  it('counts only bank holes — a typed word does not spend a chip', () => {
    const blanks = [bank('a', 'x'), text('b', 'y')];
    expect(spentBankCounts(blanks, { a: 'useState', b: 'onClick' })).toEqual({ useState: 1 });
  });

  it('counts per occupancy, so the second chip of a repeated word stays live', () => {
    const blanks = [bank('a', 'const'), bank('b', 'const')];
    expect(spentBankCounts(blanks, { a: 'const' })).toEqual({ const: 1 });
    expect(spentBankCounts(blanks, { a: 'const', b: 'const' })).toEqual({ const: 2 });
  });
});

describe('restoreGuidedValues', () => {
  it('drops a hole the author removed from the spec', () => {
    const spec = { prompt: 'p', blanks: [bank('a', 'x')] } as CodeSpec;
    expect(restoreGuidedValues(spec, { a: 'x', foi: 'embora' })).toEqual({ a: 'x' });
  });

  it('drops a select value that is no longer an option — it would grade an unseen answer', () => {
    const spec = { prompt: 'p', blanks: [select('a', 'onClick', ['onChange'])] } as CodeSpec;
    expect(restoreGuidedValues(spec, { a: 'onSubmit' })).toEqual({});
    expect(restoreGuidedValues(spec, { a: 'onChange' })).toEqual({ a: 'onChange' });
  });

  it('drops a value that is not a string — localStorage is hand-editable', () => {
    const spec = { prompt: 'p', blanks: [text('a', 'x')] } as CodeSpec;
    // Sem isso, um número chega no `.trim()` e derruba a atividade inteira.
    expect(restoreGuidedValues(spec, { a: 123 as unknown as string })).toEqual({});
  });

  it('drops a chip that left the bank, and keeps free text as typed', () => {
    const spec = {
      prompt: 'p',
      blanks: [bank('a', 'useState'), text('b', 'setX')],
    } as CodeSpec;
    expect(restoreGuidedValues(spec, { a: 'useMemo', b: 'qualquerCoisa' })).toEqual({
      b: 'qualquerCoisa',
    });
  });
});
