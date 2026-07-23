import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { I18nProvider } from '@/i18n';
import type { Activity } from '@/types/content';
import { readCodeSnapshot, saveCodeSnapshot } from '@/services/codeSnapshot.service';

/**
 * The bug this file exists for: the snack SAVED the learner's source (that is
 * how the professor pulls it to the stage) but never gave it back to its owner.
 * A refresh — accidental, a dropped connection, the browser restoring the tab —
 * dumped a teenager back on the starter mid-class.
 *
 * So these tests run against the REAL `codeSnapshot.service` and the REAL
 * localStorage: mocking the store would prove the hook calls a function, not
 * that the work actually survives a reload. Only Monaco and the preview iframe
 * are stubbed, because jsdom cannot run either.
 */

// Every value the editor is asked to render, in order — that is how we prove
// the restored code is on screen from the FIRST paint, with no starter flash.
const rendered = vi.hoisted(() => ({ values: [] as string[] }));

vi.mock('@/components/editor/CodeEditor', () => ({
  CodeEditor: ({ value, onChange }: { value: string; onChange?: (v: string) => void }) => {
    rendered.values.push(value);
    return (
      <textarea
        data-testid="mock-editor"
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
      />
    );
  },
}));

vi.mock('@/components/branded/activity/code/CodeLivePreview', () => ({
  CodeLivePreview: () => <div data-testid="mock-preview" />,
}));

import { CodeSnackActivity } from '@/components/branded/activity/code/CodeSnackActivity';

const STARTER = '// O checkbox está aqui, mas o componente não guarda NADA';
const WORK = 'const [feito, setFeito] = useState(false)';

function makeActivity(id: string): Activity {
  return { id, lessonId: 'l', ordinal: 0, kind: 'code', spec: { prompt: 'ToDoList', starter: STARTER }, rubric: null };
}

/** One mount of the activity — i.e. one page load. */
function open(id = 'act-todo') {
  rendered.values = [];
  return render(
    <I18nProvider>
      <CodeSnackActivity activity={makeActivity(id)} onComplete={vi.fn()} />
    </I18nProvider>,
  );
}

const editor = () => screen.getByTestId('mock-editor') as HTMLTextAreaElement;

function type(value: string) {
  act(() => {
    fireEvent.change(editor(), { target: { value } });
  });
}

/** Let the 600ms autosave debounce elapse. */
function settleAutosave() {
  act(() => {
    vi.advanceTimersByTime(600);
  });
}

describe('code snack — o trabalho do aluno sobrevive ao reload', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    rendered.values = [];
  });
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    localStorage.clear();
  });

  it('gives the saved work back on the next page load', () => {
    // Load 1: the learner writes something and the autosave fires.
    const first = open();
    type(WORK);
    settleAutosave();
    expect(readCodeSnapshot('act-todo')?.code).toBe(WORK);

    // …and then the page reloads.
    first.unmount();
    open();

    expect(editor().value).toBe(WORK);
  });

  it('shows the restored code on the FIRST paint — never a flash of the starter', () => {
    saveCodeSnapshot('act-todo', WORK);
    open();
    // Not "ends up correct after an effect": correct from the very first render.
    expect(rendered.values[0]).toBe(WORK);
    expect(rendered.values).not.toContain(STARTER);
  });

  it('uses the starter when the learner has nothing saved yet', () => {
    open();
    expect(editor().value).toBe(STARTER);
  });

  it('does not manufacture a snapshot for an activity that was only opened', () => {
    // The professor's stage reads this store to tell "em andamento" from "ainda
    // não começou" — merely opening the screen is not work in progress.
    open();
    settleAutosave();
    expect(readCodeSnapshot('act-todo')).toBeNull();
  });

  it('keeps each activity in its own drawer — no code leaks across them', () => {
    const first = open('act-um');
    type('codigo da atividade um');
    settleAutosave();
    first.unmount();

    // A different activity, never touched → its own starter, not the neighbour's.
    const second = open('act-dois');
    expect(editor().value).toBe(STARTER);
    type('codigo da atividade dois');
    settleAutosave();
    second.unmount();

    // …and going back gives each one its own work.
    const back = open('act-um');
    expect(editor().value).toBe('codigo da atividade um');
    back.unmount();
    open('act-dois');
    expect(editor().value).toBe('codigo da atividade dois');
  });

  it('re-seeds from the new activity when the SAME mount switches activity', () => {
    saveCodeSnapshot('act-dois', 'trabalho salvo da dois');
    const view = render(
      <I18nProvider>
        <CodeSnackActivity activity={makeActivity('act-um')} onComplete={vi.fn()} />
      </I18nProvider>,
    );
    type('trabalho da um');
    settleAutosave();

    view.rerender(
      <I18nProvider>
        <CodeSnackActivity activity={makeActivity('act-dois')} onComplete={vi.fn()} />
      </I18nProvider>,
    );

    expect(editor().value).toBe('trabalho salvo da dois');
    // The pending debounce must not write activity-um's source onto activity-dois.
    settleAutosave();
    expect(readCodeSnapshot('act-dois')?.code).toBe('trabalho salvo da dois');
    expect(readCodeSnapshot('act-um')?.code).toBe('trabalho da um');
  });

  it('"Recomeçar do código inicial" really clears it — the reload brings the starter', () => {
    const first = open();
    type('quebrei tudo');
    settleAutosave();
    expect(readCodeSnapshot('act-todo')?.code).toBe('quebrei tudo');

    act(() => {
      fireEvent.click(screen.getByTestId('code-reset'));
    });
    act(() => {
      fireEvent.click(screen.getByTestId('code-reset-confirm'));
    });
    settleAutosave();

    expect(editor().value).toBe(STARTER);
    expect(readCodeSnapshot('act-todo')).toBeNull();

    // The reload after a reset must NOT resurrect the discarded work.
    first.unmount();
    open();
    expect(editor().value).toBe(STARTER);
  });

  it('survives a browser where localStorage is unavailable', () => {
    // Private mode / quota exceeded: every snapshot operation throws. Scoped to
    // our own keys so the failure under test is the snack's, not the app shell's.
    const isSnapshotKey = (key: string) => key.startsWith('itera.code.snapshot:');
    const boom = () => {
      throw new Error('SecurityError');
    };
    const spies = [
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (this: Storage, key) {
        return isSnapshotKey(key) ? boom() : null;
      }),
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key) => {
        if (isSnapshotKey(key)) boom();
      }),
      vi.spyOn(Storage.prototype, 'removeItem').mockImplementation((key) => {
        if (isSnapshotKey(key)) boom();
      }),
    ];

    try {
      open();
      // The activity still opens, on the starter…
      expect(editor().value).toBe(STARTER);
      // …and stays fully usable: typing and autosaving must not throw.
      type(WORK);
      settleAutosave();
      expect(editor().value).toBe(WORK);
      // Recomeçar must not throw either, with removeItem equally unavailable.
      act(() => {
        fireEvent.click(screen.getByTestId('code-reset'));
      });
      act(() => {
        fireEvent.click(screen.getByTestId('code-reset-confirm'));
      });
      expect(editor().value).toBe(STARTER);
    } finally {
      spies.forEach((s) => s.mockRestore());
    }
  });
});
