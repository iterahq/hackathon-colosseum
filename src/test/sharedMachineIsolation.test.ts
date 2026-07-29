import { describe, it, expect, beforeEach } from 'vitest';
import { readCodeSnapshot, saveCodeSnapshot } from '@/services/codeSnapshot.service';
import { readStoredAnswer, storeAnswer } from '@/utils/liveAnswerStorage';
import { gatherStageContent } from '@/utils/stageAnswerContent';
import { clearIteraStorage, rememberStorageScope } from '@/utils/storageScope';

/**
 * The Educar+ lab machines are shared. Before this fix the snapshot key named
 * only the activity, so aluno B opened the activity and Monaco handed them
 * aluno A's source — and the professor projected A's code to the room labelled
 * with B's name. These run against the REAL stores and the REAL localStorage:
 * mocking them would only prove a function was called.
 */

const ACTIVITY = 'act-todo';
const SESSION = 'sess-1';

describe('shared lab machine — one browser, many students', () => {
  beforeEach(() => localStorage.clear());

  it('does not hand a code snapshot from one learner to the next', () => {
    rememberStorageScope('aluno-a');
    saveCodeSnapshot(ACTIVITY, 'const resposta = "trabalho da A"');
    expect(readCodeSnapshot(ACTIVITY)?.code).toBe('const resposta = "trabalho da A"');

    rememberStorageScope('aluno-b');
    expect(readCodeSnapshot(ACTIVITY)).toBeNull();
  });

  it('still gives each learner their own work back', () => {
    rememberStorageScope('aluno-a');
    saveCodeSnapshot(ACTIVITY, 'trabalho da A');
    rememberStorageScope('aluno-b');
    saveCodeSnapshot(ACTIVITY, 'trabalho da B');

    expect(readCodeSnapshot(ACTIVITY)?.code).toBe('trabalho da B');
    rememberStorageScope('aluno-a');
    expect(readCodeSnapshot(ACTIVITY)?.code).toBe('trabalho da A');
  });

  it('does not leak live answers across learners in the same session', () => {
    rememberStorageScope('aluno-a');
    storeAnswer(SESSION, ACTIVITY, { correct: true, elapsedMs: 4200 });
    expect(readStoredAnswer(SESSION, ACTIVITY)?.correct).toBe(true);

    rememberStorageScope('aluno-b');
    expect(readStoredAnswer(SESSION, ACTIVITY)).toBeNull();
  });

  it('never stages a classmate snapshot — the pull reads the caller scope', () => {
    rememberStorageScope('aluno-a');
    saveCodeSnapshot(ACTIVITY, 'codigo da A');

    rememberStorageScope('aluno-b');
    expect(gatherStageContent(SESSION, ACTIVITY)).toEqual({
      kind: 'empty',
      content: '',
      status: 'not_started',
    });
  });

  it('persists nothing while the owner is still unresolved', () => {
    saveCodeSnapshot(ACTIVITY, 'sem dono');
    storeAnswer(SESSION, ACTIVITY, { correct: true, elapsedMs: 1 });
    expect(localStorage.length).toBe(0);

    rememberStorageScope('aluno-a');
    expect(readCodeSnapshot(ACTIVITY)).toBeNull();
    expect(readStoredAnswer(SESSION, ACTIVITY)).toBeNull();
  });

  it('leaves a pre-fix unscoped snapshot unreadable by anyone', () => {
    localStorage.setItem(
      'itera.code.snapshot:' + ACTIVITY,
      JSON.stringify({ code: 'trabalho orfao', savedAt: '2026-07-01T00:00:00Z' })
    );
    rememberStorageScope('aluno-b');
    expect(readCodeSnapshot(ACTIVITY)).toBeNull();

    clearIteraStorage();
    expect(localStorage.getItem('itera.code.snapshot:' + ACTIVITY)).toBeNull();
  });
});
