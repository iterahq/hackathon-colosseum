import { describe, expect, it } from 'vitest';
import { parseEditableRegions } from '@iterahq/activities/code';
import { lockedLineRuns } from './lockedLineRuns';

const region = (startLineNumber: number, endLineNumber: number) => ({
  startLineNumber,
  startColumn: 1,
  endLineNumber,
  endColumn: 1,
});

describe('lockedLineRuns', () => {
  it('sem região, nada é apagado — o arquivo inteiro está aberto', () => {
    expect(lockedLineRuns([], 20)).toEqual([]);
  });

  it('apaga o que sobra dos dois lados, poupando as linhas de marcador', () => {
    expect(lockedLineRuns([region(4, 6)], 10)).toEqual([
      { startLineNumber: 1, endLineNumber: 2 },
      { startLineNumber: 8, endLineNumber: 10 },
    ]);
  });

  it('apaga o miolo entre duas faixas', () => {
    expect(lockedLineRuns([region(3, 4), region(9, 10)], 12)).toEqual([
      { startLineNumber: 1, endLineNumber: 1 },
      { startLineNumber: 6, endLineNumber: 7 },
      { startLineNumber: 12, endLineNumber: 12 },
    ]);
  });

  it('faixa colada no fim não deixa run vazia depois dela', () => {
    expect(lockedLineRuns([region(3, 5)], 5)).toEqual([{ startLineNumber: 1, endLineNumber: 1 }]);
  });

  it('as linhas que o parser abre nunca entram no apagado', () => {
    const starter = [
      'function App() {',
      '  // >>>',
      '  const [n, setN] = useState(0);',
      '  // <<<',
      '  return <b>{n}</b>;',
      '}',
    ].join('\n');
    const regions = parseEditableRegions(starter);
    const locked = lockedLineRuns(regions, 6);
    const lockedLines = locked.flatMap((r) => {
      const lines = [];
      for (let l = r.startLineNumber; l <= r.endLineNumber; l++) lines.push(l);
      return lines;
    });
    expect(lockedLines).not.toContain(3);
    expect(lockedLines).toEqual([1, 5, 6]);
  });
});
