import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { ActivityProvider } from '@iterahq/activities';
import type { ActivityCodeEditorProps } from '@iterahq/activities';
import { I18nProvider, useI18n } from '@/i18n';
import type { Activity } from '@/types/content';
import {
  ITERA_ACTIVITY_LIVE_BUFFER,
  ITERA_ACTIVITY_STORAGE,
} from '@/components/branded/activity/IteraActivityHost';
import { readCodeSnapshot, saveCodeSnapshot } from '@/services/codeSnapshot.service';
import { forgetCodeLiveBuffer, readCodeLiveBuffer } from '@/services/codeLiveBuffer.service';
import { rememberStorageScope } from '@/utils/storageScope';

/**
 * The bug this file exists for: the snack SAVED the learner's source (that is
 * how the professor pulls it to the stage) but never gave it back to its owner.
 * A refresh — accidental, a dropped connection, the browser restoring the tab —
 * dumped a teenager back on the starter mid-class.
 *
 * So these tests run against the REAL `codeSnapshot.service` and the REAL
 * localStorage: mocking the store would prove the hook calls a function, not
 * that the work actually survives a reload.
 *
 * ⚠️ Since Fase C step 5 they are ALSO the compatibility guard for the storage
 * port. `useCodeSnack` moved into `@iterahq/activities/code` and now writes
 * through `ActivityStoragePort`; `ITERA_ACTIVITY_STORAGE` is the adapter that
 * routes it back to `codeSnapshot.service`. Every `readCodeSnapshot(...)`
 * assertion below therefore asserts, verbatim and per activity, that the
 * extraction did not move a single learner's draft. Injecting the adapter here
 * rather than letting the package fall back to its own localStorage default is
 * the whole reason these tests still mean something.
 *
 * Monaco is stubbed the new way — as an injected `codeEditor` port rather than
 * a `vi.mock` of the app module, because the package imports its own editor
 * surface and would never see the mock. The preview iframe is no longer stubbed
 * at all: jsdom renders it inert, and nothing here submits.
 */

// Every value the editor is asked to render, in order — that is how we prove
// the restored code is on screen from the FIRST paint, with no starter flash.
const rendered = vi.hoisted(() => ({ values: [] as string[] }));

function RecordingEditor({ value, onChange }: ActivityCodeEditorProps) {
  rendered.values.push(value);
  return (
    <textarea
      data-testid="mock-editor"
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
    />
  );
}

/**
 * The Player's own host context, minus the parts a draft test does not need.
 *
 * Both REAL adapters, for the same reason: with the live-buffer port absent the
 * package's publish is a silent no-op, so every `readCodeLiveBuffer` assertion
 * below would read `null` and could only ever prove the projection is empty.
 */
function Host({ children }: { children: ReactNode }) {
  const i18n = useI18n();
  return (
    <ActivityProvider
      i18n={i18n}
      storage={ITERA_ACTIVITY_STORAGE}
      liveBuffer={ITERA_ACTIVITY_LIVE_BUFFER}
      codeEditor={RecordingEditor}
    >
      {children}
    </ActivityProvider>
  );
}

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
      <Host>
        <CodeSnackActivity activity={makeActivity(id)} onComplete={vi.fn()} />
      </Host>
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
    rememberStorageScope('aluno-a');
    rendered.values = [];
    // O buffer vivo é um Map de módulo: sobrevive entre testes se ninguém o
    // esquecer, e aí um teste herdaria a tela do anterior.
    ['act-todo', 'act-um', 'act-dois'].forEach(forgetCodeLiveBuffer);
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

  it('publica o starter intocado pro palco, sem inventar snapshot', () => {
    // As duas metades do defeito P1 são independentes: o palco precisa TER o que
    // projetar desde o mount, e o `hasWork: false` é o que impede a turma de ler
    // o starter como resposta do aluno (e a presença de anunciá-lo trabalhando).
    open();
    expect(readCodeLiveBuffer('act-todo')).toEqual({ code: STARTER, hasWork: false });
    settleAutosave();
    expect(readCodeSnapshot('act-todo')).toBeNull();
  });

  it('depois do reload, o trabalho restaurado conta como trabalho', () => {
    // A regressão que a review pegou: o buffer nascia intocado porque ninguém
    // digitou NESTA montagem, então código de verdade ia pro projetor rotulado
    // "sem edições" e o aluno era reportado como não trabalhando.
    saveCodeSnapshot('act-todo', WORK);
    open();
    expect(readCodeLiveBuffer('act-todo')).toEqual({ code: WORK, hasWork: true });
  });

  it('"Recomeçar" volta o buffer pro starter intocado antes de limpar o snapshot', () => {
    open();
    type('quebrei tudo');
    settleAutosave();
    expect(readCodeLiveBuffer('act-todo')?.hasWork).toBe(true);

    act(() => {
      fireEvent.click(screen.getByTestId('code-reset'));
    });
    act(() => {
      fireEvent.click(screen.getByTestId('code-reset-confirm'));
    });

    // Sem isso o palco e a presença seguiriam anunciando o rascunho que o aluno
    // acabou de jogar fora — o `clearCodeSnapshot` despacha o evento na hora.
    expect(readCodeLiveBuffer('act-todo')).toEqual({ code: STARTER, hasWork: false });
  });

  it('esquece o buffer quando o aluno sai da atividade', () => {
    const view = open();
    type(WORK);
    view.unmount();
    // Aba fechada / outro kind na tela: o palco tem que cair no snapshot em vez
    // de projetar uma tela que não existe mais.
    expect(readCodeLiveBuffer('act-todo')).toBeNull();
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
        <Host>
          <CodeSnackActivity activity={makeActivity('act-um')} onComplete={vi.fn()} />
        </Host>
      </I18nProvider>,
    );
    type('trabalho da um');
    settleAutosave();

    view.rerender(
      <I18nProvider>
        <Host>
          <CodeSnackActivity activity={makeActivity('act-dois')} onComplete={vi.fn()} />
        </Host>
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
