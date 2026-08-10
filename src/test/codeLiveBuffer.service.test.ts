import { beforeEach, describe, expect, it } from 'vitest';
import {
  forgetCodeLiveBuffer,
  publishCodeLiveBuffer,
  readCodeLiveBuffer,
} from '@/services/codeLiveBuffer.service';

const ACT = 'act-code';

describe('code live buffer', () => {
  beforeEach(() => {
    forgetCodeLiveBuffer(ACT);
    forgetCodeLiveBuffer('outra');
  });

  it('publishes an UNTOUCHED buffer', () => {
    // É o caso que o palco não conseguia projetar: o aluno abriu o exercício e
    // ainda não digitou. O starter na tela dele é conteúdo legítimo pra turma.
    publishCodeLiveBuffer(ACT, 'const a = 1', false);
    expect(readCodeLiveBuffer(ACT)).toEqual({ code: 'const a = 1', hasWork: false });
  });

  it('keeps `hasWork` apart from having content', () => {
    publishCodeLiveBuffer(ACT, 'const a = 2', true);
    expect(readCodeLiveBuffer(ACT)?.hasWork).toBe(true);
  });

  it('answers null for an activity nobody opened', () => {
    expect(readCodeLiveBuffer('nunca-aberta')).toBeNull();
  });

  it('does not cross activities', () => {
    publishCodeLiveBuffer(ACT, 'da primeira', true);
    publishCodeLiveBuffer('outra', 'da segunda', true);
    expect(readCodeLiveBuffer(ACT)?.code).toBe('da primeira');
  });

  it('forgets on teardown so the stage stops projecting a screen the learner left', () => {
    publishCodeLiveBuffer(ACT, 'trabalho', true);
    forgetCodeLiveBuffer(ACT);
    expect(readCodeLiveBuffer(ACT)).toBeNull();
  });

  it('ignores an empty activity id instead of keying on ""', () => {
    publishCodeLiveBuffer('', 'orfao', true);
    expect(readCodeLiveBuffer('')).toBeNull();
  });
});
