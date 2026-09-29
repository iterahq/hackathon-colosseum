/**
 * The READ side of the trace — and above all, the rule that a missing enunciado
 * must NEVER be QUIETLY replaced by today's one.
 *
 * ⚠️ "Quietly" is the whole load. Since 2026-08-04 today's spec IS rendered when
 * there is no snapshot, because 43 of the 45 recorded attempts had none and
 * every one of them was unwatchable. What must never happen is that inference
 * arriving under a capture's label — so the tests below assert the THREE arms
 * are distinct, mutually exclusive, and that the precedence is one-way.
 *
 * Plan `20260803-itera-replay-de-sessao-de-atividade`, Fase 1.
 */
import { describe, expect, it } from 'vitest';
import {
  familyEmitsSequence,
  formatOffset,
  gapsBetween,
  labelIndexFor,
  readReplaySession,
  replayStateAt,
} from '@/utils/replaySession';

const ROW = {
  id: 't1',
  user_id: 'u1',
  activity_id: 'a1',
  schema_version: 1,
  started_at: '2026-08-04T10:00:00.000Z',
  actions_truncated: false,
  outcome: 'settled',
  activities: { kind: 'single_choice' },
  actions: [
    { type: 'activity_opened', at_ms: 0 },
    { type: 'option_selected', at_ms: 4000, payload: { option_id: 'b' } },
    { type: 'option_deselected', at_ms: 9000, payload: { option_id: 'b' } },
    { type: 'option_selected', at_ms: 9500, payload: { option_id: 'a' } },
    { type: 'answer_submitted', at_ms: 10_000, payload: { option_ids: ['a'] } },
    { type: 'attempt_settled', at_ms: 10_200, payload: { passed: true } },
  ],
  spec_snapshot: {
    instruction: { text: 'Capital da França?' },
    options: [
      { id: 'a', label: 'Paris' },
      { id: 'b', label: 'Lyon' },
    ],
    correct_option_id: 'a',
  },
  spec_locale: 'pt',
};

describe('o enunciado é uma união marcada, não um campo opcional', () => {
  it('lê o snapshot COM o locale em que o aluno leu', () => {
    const s = readReplaySession(ROW);
    expect(s?.enunciado.status).toBe('captured');
    expect(s?.enunciado.locale).toBe('pt');
    expect(s?.enunciado.spec).toEqual(ROW.spec_snapshot);
  });

  it('🔴 snapshot NULL, e SEM spec atual, é "não capturado"', () => {
    const s = readReplaySession({ ...ROW, spec_snapshot: null, spec_locale: null });
    expect(s).not.toBeNull();
    expect(s?.enunciado.status).toBe('not_captured');
    // A união é o mecanismo: não existe um `spec` para a UI cair em cima.
    expect(s?.enunciado.spec).toBeNull();
    expect(s?.enunciado.locale).toBeNull();
    // …e a sequência continua inteira. Perder o enunciado não custa as ações.
    expect(s?.actions).toHaveLength(ROW.actions.length);
  });

  it('objeto VAZIO não é captura — `{}` seria uma afirmação', () => {
    // Espelha `buildSpecSnapshot`, que se recusa a escrever `{}` pela mesma razão.
    expect(readReplaySession({ ...ROW, spec_snapshot: {} })?.enunciado.status).toBe('not_captured');
  });

  it('snapshot SEM locale não é captura — o par é um fato só', () => {
    // Um snapshot cuja língua é desconhecida é ambíguo exatamente onde importa:
    // o spec de `chat_sandbox` é guardado com as bags `{pt,en}` intactas.
    expect(readReplaySession({ ...ROW, spec_locale: null })?.enunciado.status).toBe('not_captured');
    expect(readReplaySession({ ...ROW, spec_locale: '' })?.enunciado.status).toBe('not_captured');
  });

  it('linha sem identidade não vira sessão', () => {
    expect(readReplaySession({ ...ROW, id: null })).toBeNull();
    expect(readReplaySession(null)).toBeNull();
    expect(readReplaySession('nope')).toBeNull();
  });

  it('⚠️ outcome NULL permanece NULL — não é "settled"', () => {
    // Uma linha anterior à migration 0040 não afirma nada sobre como terminou.
    expect(readReplaySession({ ...ROW, outcome: null })?.outcome).toBeNull();
  });

  it('uma linha do FUTURO é reportada, nunca descartada', () => {
    const s = readReplaySession({ ...ROW, schema_version: 99 });
    expect(s?.fromFuture).toBe(true);
    expect(s?.actions).toHaveLength(ROW.actions.length);
  });
});

/* ── O terceiro braço: INFERRED (2026-08-04) ──────────────────────────────── */

const TODAY_SPEC = {
  instruction: { text: { pt: 'Capital da França, hoje?', en: 'Capital of France, today?' } },
  options: [
    { id: 'a', label: { pt: 'Paris', en: 'Paris' } },
    { id: 'b', label: { pt: 'Lião', en: 'Lyon' } },
  ],
};

const NO_SNAPSHOT = { ...ROW, spec_snapshot: null, spec_locale: null };

describe('sem snapshot mas COM spec atual, o enunciado é INFERIDO — nunca capturado', () => {
  it('🔴 o spec de hoje sai como `inferred`, e a distinção é o mecanismo', () => {
    const s = readReplaySession({
      ...NO_SNAPSHOT,
      activities: { kind: 'single_choice', spec: TODAY_SPEC },
    });
    expect(s?.enunciado.status).toBe('inferred');
    expect(s?.enunciado.spec).toEqual(TODAY_SPEC);
    // O texto existe (há o que assistir), mas NÃO existe locale: a linha não
    // registra em que língua o aluno leu, e inventar um seria a única mentira
    // que este braço pode contar.
    expect(s?.enunciado.locale).toBeNull();
  });

  it('🔴 uma CAPTURA nunca é rebaixada nem contaminada pelo spec de hoje', () => {
    // A ordem de precedência é one-way: com snapshot válido, o spec atual está
    // presente na linha e é simplesmente ignorado — nem substitui, nem funde.
    const s = readReplaySession({ ...ROW, activities: { kind: 'single_choice', spec: TODAY_SPEC } });
    expect(s?.enunciado.status).toBe('captured');
    expect(s?.enunciado.spec).toEqual(ROW.spec_snapshot);
    expect(s?.enunciado.locale).toBe('pt');
  });

  it('spec atual VAZIO ou ausente cai em `not_captured`, nunca num painel vazio', () => {
    // Um `inferred` sem conteúdo seria pior que o estado honesto de ausência:
    // prometeria texto e não entregaria nenhum.
    for (const activities of [
      { kind: 'single_choice', spec: {} },
      { kind: 'single_choice', spec: null },
      { kind: 'single_choice' },
      null,
    ]) {
      expect(readReplaySession({ ...NO_SNAPSHOT, activities })?.enunciado.status).toBe(
        'not_captured'
      );
    }
  });

  it('os três estados são MUTUAMENTE EXCLUSIVOS e cobrem a linha inteira', () => {
    // A garantia que a tela depende: exatamente um braço, sempre.
    const statuses = [
      readReplaySession({ ...ROW, activities: { kind: 'single_choice', spec: TODAY_SPEC } }),
      readReplaySession({ ...NO_SNAPSHOT, activities: { kind: 'single_choice', spec: TODAY_SPEC } }),
      readReplaySession(NO_SNAPSHOT),
    ].map((s) => s?.enunciado.status);
    expect(statuses).toEqual(['captured', 'inferred', 'not_captured']);
    expect(new Set(statuses).size).toBe(3);
  });

  it('a inferência não custa a sequência — as ações continuam exatas', () => {
    // O que o replay tem de verdadeiro (o QUE o aluno tocou e QUANDO) não é
    // afetado por não se saber o texto: é o argumento inteiro para mostrar a
    // tentativa em vez de escondê-la atrás de um painel vazio.
    const s = readReplaySession({
      ...NO_SNAPSHOT,
      activities: { kind: 'single_choice', spec: TODAY_SPEC },
    });
    expect(s?.actions).toHaveLength(ROW.actions.length);
  });
});

describe('o fold de replay reconstrói o estado de cada passo', () => {
  const actions = ROW.actions;

  it('antes de qualquer ação, nada está escolhido', () => {
    expect(replayStateAt(actions, 0).selected).toEqual([]);
  });

  it('a troca de opção aparece passo a passo — o "quase errou" do plano', () => {
    expect(replayStateAt(actions, 2).selected).toEqual(['b']);
    expect(replayStateAt(actions, 3).selected).toEqual([]);
    expect(replayStateAt(actions, 4).selected).toEqual(['a']);
  });

  it('no fim, o veredito que o aluno viu', () => {
    const end = replayStateAt(actions, actions.length);
    expect(end.submitted).toBe(true);
    expect(end.ended).toBe('settled');
    expect(end.passed).toBe(true);
  });

  it('um tipo de ação desconhecido avança e não quebra', () => {
    // Vocabulário aberto na leitura: uma build mais nova pode emitir qualquer
    // coisa, e o leitor não pode engasgar.
    const s = replayStateAt(
      [
        { type: 'activity_opened', at_ms: 0 },
        { type: 'telepathy_detected', at_ms: 1 },
        { type: 'option_selected', at_ms: 2, payload: { option_id: 'a' } },
      ],
      3
    );
    expect(s.selected).toEqual(['a']);
  });

  it('pares de `match` são feitos e desfeitos', () => {
    const s = replayStateAt(
      [
        { type: 'pair_armed', at_ms: 1, payload: { left_id: 'l1' } },
        { type: 'pair_made', at_ms: 2, payload: { left_id: 'l1', right_id: 'r2' } },
        { type: 'pair_broken', at_ms: 3, payload: { left_id: 'l1', right_id: 'r2' } },
      ],
      3
    );
    expect(s.pairs).toEqual([]);
    expect(replayStateAt(
      [
        { type: 'pair_armed', at_ms: 1, payload: { left_id: 'l1' } },
        { type: 'pair_made', at_ms: 2, payload: { left_id: 'l1', right_id: 'r2' } },
      ],
      2
    ).pairs).toEqual([['l1', 'r2']]);
  });

  it('o `answer_submitted` de `order` é autoritativo sobre a permutação', () => {
    const s = replayStateAt(
      [
        { type: 'item_moved', at_ms: 1, payload: { item_id: 'x', to: 0 } },
        { type: 'answer_submitted', at_ms: 2, payload: { order: ['c', 'b', 'a'] } },
      ],
      2
    );
    expect(s.order).toEqual(['c', 'b', 'a']);
  });

  it('nunca lê além do fim da lista', () => {
    expect(replayStateAt(actions, 999).ended).toBe('settled');
    expect(replayStateAt([], 5)).toMatchObject({ selected: [], ended: null });
  });
});

describe('rótulos vêm do snapshot ou não vêm', () => {
  it('indexa opções, itens e cartas', () => {
    expect(labelIndexFor(ROW.spec_snapshot)).toEqual({ a: 'Paris', b: 'Lyon' });
    expect(
      labelIndexFor({ left: [{ id: 'l1', label: 'Um' }], right: [{ id: 'r1', text: 'One' }] })
    ).toEqual({ l1: 'Um', r1: 'One' });
  });

  it('🔴 sem snapshot o índice é VAZIO — a UI mostra o id cru, não o rótulo de hoje', () => {
    expect(labelIndexFor(null)).toEqual({});
  });
});

describe('a tela sabe dizer que a família ainda não emite sequência', () => {
  it('selection e arrangement emitem', () => {
    expect(familyEmitsSequence('single_choice')).toBe(true);
    expect(familyEmitsSequence('match')).toBe(true);
  });

  it('reading e editor ainda não', () => {
    // Apresentar isso como falha da tentativa é o risco que o plano nomeia; a
    // tela declara o motivo.
    expect(familyEmitsSequence('concept')).toBe(false);
    expect(familyEmitsSequence('code')).toBe(false);
    expect(familyEmitsSequence(null)).toBe(false);
  });

  it('reading depende do KIND — as cenas emitem, o concept ainda não', () => {
    // A família `reading` passou a emitir em 2026-09-24, mas só pelas cenas.
    expect(familyEmitsSequence('xray')).toBe(true);
    expect(familyEmitsSequence('live_type')).toBe(true);
    expect(familyEmitsSequence('inspect')).toBe(true);
    expect(familyEmitsSequence('concept_reveal')).toBe(false);
  });

  it('scenario depende do KIND — o terminal emite, o chat ainda não', () => {
    // A família `scenario` passou a emitir em 2026-08, mas só pelo terminal.
    // Responder pela família sozinha viraria toda linha de chat de "esse kind
    // ainda não emite" (verdade, e explicado) para "o aluno não fez nada"
    // (mentira, e sem explicação).
    expect(familyEmitsSequence('terminal_sandbox')).toBe(true);
    expect(familyEmitsSequence('chat_sandbox')).toBe(false);
    // Sem kind, a resposta conservadora: não promete sequência.
    expect(familyEmitsSequence(null)).toBe(false);
  });
});

describe('offsets e lacunas', () => {
  it('a lacuna antes de cada ação é onde o aluno pensou', () => {
    expect(gapsBetween(ROW.actions)).toEqual([0, 4000, 5000, 500, 500, 200]);
  });

  it('formata segundos e minutos', () => {
    expect(formatOffset(4200)).toBe('4.2s');
    expect(formatOffset(64_000)).toBe('1m 04s');
    expect(formatOffset(-1)).toBe('0.0s');
  });
});
