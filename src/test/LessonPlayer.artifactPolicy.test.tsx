/**
 * The player's POLICY-DRIVEN save path.
 *
 * Plan: 20260728-itera-artifact-storage. Migration `0027`.
 *
 * `artifactPolicy.test.ts` proves the resolver in isolation. This proves the
 * wiring: that the player actually consults it, that it does NOT write for an
 * activity whose kind default says no, that an authored `mode: 'always'` turns a
 * deterministic answer into a real save, and that the saved row carries the
 * git-shaped `repo_path` the folder UI and Phase 4 both depend on.
 *
 * `saveArtifact` is mocked at the service boundary — the point under test is the
 * DECISION, not Supabase.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import LessonPlayer from '@/pages/LessonPlayer';
import type { Activity } from '@/types/content';

const useLessonContent = vi.fn();
const useNextLesson = vi.fn();

vi.mock('@/api/iteraApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/iteraApi')>()),
  iteraApiConfigured: vi.fn(() => false),
}));
vi.mock('@/hooks', () => ({
  useLessonContent: (id?: string) => useLessonContent(id),
  useNextLesson: (id?: string) => useNextLesson(id),
}));

// The stub hands up BOTH shapes so a single harness can exercise the free-text
// path (artifact) and the deterministic path (response).
vi.mock('@/components/branded/activity/ActivityRenderer', () => ({
  ActivityRenderer: ({
    onComplete,
  }: {
    onComplete: (c: boolean, d?: unknown) => void;
  }) => (
    <>
      <button
        data-testid="complete-with-artifact"
        onClick={() =>
          onComplete(true, {
            artifact: {
              type: 'text',
              content: 'minha reflexão',
              filename: 'reflection.md',
              mimeType: 'text/markdown',
            },
          })
        }
      >
        produce
      </button>
      <button
        data-testid="complete-with-response"
        onClick={() => onComplete(true, { response: 'Opção B' })}
      >
        answer
      </button>
    </>
  ),
}));

const saveArtifact = vi.fn(async () => true);
vi.mock('@/services/artifact.service', () => ({
  saveArtifact: (...args: unknown[]) => saveArtifact(...(args as [])),
}));

vi.mock('@/services/progress.service', () => ({
  persistActivityProgress: vi.fn(async () => true),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn() } }));

function activity(over: Partial<Activity> = {}): Activity {
  return {
    id: 'act-1',
    lessonId: 'lesson-1',
    ordinal: 3,
    kind: 'document',
    spec: { prompt: 'Reflexão' },
    rubric: null,
    ...over,
  } as Activity;
}

function mountLesson(a: Activity) {
  useLessonContent.mockReturnValue({
    data: {
      id: 'lesson-1',
      title: { pt: 'Modelagem' },
      activities: [a],
      placement: {
        programSlug: 'data-modeling',
        unitTitle: { pt: 'Fundamentos' },
        unitOrdinal: 1,
        lessonOrdinal: 2,
      },
    },
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  });
  useNextLesson.mockReturnValue({ data: null });
  render(
    <MemoryRouter initialEntries={['/lesson/lesson-1']}>
      <I18nProvider>
        <LessonPlayer />
      </I18nProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  saveArtifact.mockClear();
});

describe('LessonPlayer — the author decides what persists', () => {
  it('saves a document reflection by default, with a git-shaped repo_path', async () => {
    mountLesson(activity());
    fireEvent.click(screen.getByTestId('complete-with-artifact'));

    await waitFor(() => expect(saveArtifact).toHaveBeenCalledTimes(1));
    const [activityId, artifact, options] = saveArtifact.mock.calls[0] as unknown as [
      string,
      { filename: string; content: string },
      { repoPath: string },
    ];
    expect(activityId).toBe('act-1');
    expect(artifact.filename).toBe('reflection.md');
    expect(artifact.content).toBe('minha reflexão');
    // The SAME string the folder UI groups by and Phase 4 will commit to.
    expect(options.repoPath).toBe(
      'data-modeling/01-fundamentos/02-modelagem/03-reflexao/reflection.md',
    );
  });

  it('does NOT save when the author set mode=never, even though the kind default would', async () => {
    mountLesson(activity({ artifactPolicy: { mode: 'never' } }));
    fireEvent.click(screen.getByTestId('complete-with-artifact'));

    // Give the best-effort async path a chance to run before asserting absence.
    await new Promise((r) => setTimeout(r, 20));
    expect(saveArtifact).not.toHaveBeenCalled();
  });

  it('does NOT save a deterministic answer by default', async () => {
    mountLesson(activity({ kind: 'single_choice', spec: { prompt: 'Escolha' } }));
    fireEvent.click(screen.getByTestId('complete-with-response'));
    // A graded kind settles in the fixed footer; "Continuar" is what commits.
    fireEvent.click(await screen.findByTestId('feedback-footer-continue'));

    await new Promise((r) => setTimeout(r, 20));
    expect(saveArtifact).not.toHaveBeenCalled();
  });

  it('DOES save a deterministic answer through the authored template (no AI)', async () => {
    mountLesson(
      activity({
        kind: 'single_choice',
        spec: { prompt: 'Escolha' },
        artifactPolicy: {
          mode: 'always',
          filename: 'decisao.md',
          template: '# {{title}}\n\n{{response}}\n',
        },
      }),
    );
    fireEvent.click(screen.getByTestId('complete-with-response'));
    fireEvent.click(await screen.findByTestId('feedback-footer-continue'));

    await waitFor(() => expect(saveArtifact).toHaveBeenCalledTimes(1));
    const [, artifact] = saveArtifact.mock.calls[0] as unknown as [
      string,
      { filename: string; content: string },
    ];
    expect(artifact.filename).toBe('decisao.md');
    expect(artifact.content).toBe('# Escolha\n\nOpção B\n');
  });
});
