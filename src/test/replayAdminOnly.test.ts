/**
 * 🔒 QUEM PODE ASSISTIR — o teste, não o argumento.
 *
 * Tainan, TG 2026-08-04, R2: *"so admin assiste replay de aluno. so do tenant
 * dele tbm."*
 *
 * Isso é MAIS ESTRITO que a RLS. A policy `traces_select_instructor`
 * (`db/migrations/0034_activity_traces.sql:274-281`) dá SELECT em
 * `itera.activity_traces` ao INSTRUTOR do tenant do aluno, e ela continua de pé
 * — o instrutor mantém a leitura normal de resultado que sempre teve. O que a
 * decisão diz é que a SUPERFÍCIE DE REPLAY tem plateia mais estreita, e essa
 * restrição é da superfície.
 *
 * Este arquivo prova as três afirmações que sustentam isso:
 *
 *   1. um instrutor NÃO CHEGA A CONSULTAR `activity_traces` — não é resultado
 *      vazio de uma query que rodou, é query que não acontece;
 *   2. quem é admin de A **e** instrutor de B só enxerga aluno de A. Esta é a
 *      parte sutil: o PostgREST faz OR das policies, então sem o filtro
 *      explícito de `user_id` a RLS devolveria o tenant B junto;
 *   3. o replay não escreve nada, em lugar nenhum.
 *
 * ⚠️ E O LIMITE HONESTO: este é um portão de APLICAÇÃO. Um instrutor que
 * consulte a tabela direto com o próprio JWT ainda recebe linhas, porque a
 * policy continua existindo — acesso pré-existente, não algo que esta feature
 * concedeu. Fechar isso no banco exige migration (RPC SECURITY DEFINER ou
 * policy restritiva) e, desde 2026-08-04, mergear migration APLICA em produção,
 * então vai em PR própria com gate humano.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Membership } from '@/services/membership.service';

const ROOT = path.resolve(__dirname, '../..');

/* ── O cliente Supabase falso, que ANOTA toda tabela consultada ──────────── */

interface Recorded {
  table: string;
  filters: Record<string, unknown>;
}
const recorded: Recorded[] = [];
let tableRows: Record<string, unknown[]> = {};

vi.mock('@/lib/supabase/client', () => ({
  isSupabaseConfigured: true,
  getSupabase: () => ({
    from(table: string) {
      const rec: Recorded = { table, filters: {} };
      recorded.push(rec);
      const result = () => Promise.resolve({ data: tableRows[table] ?? [], error: null });
      const q = {
        select: () => q,
        eq: (c: string, v: unknown) => {
          rec.filters[`eq:${c}`] = v;
          return q;
        },
        in: (c: string, v: unknown) => {
          rec.filters[`in:${c}`] = v;
          return q;
        },
        order: () => q,
        limit: () => q,
        then: (onOk: (r: unknown) => unknown, onErr?: (e: unknown) => unknown) =>
          result().then(onOk, onErr),
      };
      return q;
    },
  }),
}));

/* ── As memberships do CHAMADOR. `adminTenantId` fica REAL (é puro) ───────── */

let callerMemberships: Membership[] = [];
vi.mock('@/services/membership.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/membership.service')>();
  return { ...actual, getMyMemberships: async () => callerMemberships };
});

const { fetchReplaySession, listReplaySessions } = await import('@/services/replay.service');

const TRACE_ROW = {
  id: 't1',
  user_id: 'learner-A',
  activity_id: 'act-1',
  schema_version: 1,
  started_at: '2026-08-04T10:00:00.000Z',
  actions: [{ type: 'activity_opened', at_ms: 0 }],
  actions_truncated: false,
  outcome: 'settled',
  spec_snapshot: { instruction: { text: 'x' } },
  spec_locale: 'pt',
  activities: { kind: 'single_choice' },
  users: { display_name: 'Aluna A' },
};

beforeEach(() => {
  recorded.length = 0;
  tableRows = {
    memberships: [{ user_id: 'learner-A' }, { user_id: 'admin-A' }],
    activity_traces: [TRACE_ROW],
  };
});

const touchedTraces = () => recorded.filter((r) => r.table === 'activity_traces');

describe('🔒 o instrutor é RECUSADO na superfície de replay', () => {
  beforeEach(() => {
    callerMemberships = [{ tenantId: 'tenant-A', role: 'instructor' }];
  });

  it('a listagem devolve vazio E NÃO consulta activity_traces', () => {
    return listReplaySessions().then((rows) => {
      expect(rows).toEqual([]);
      // O ponto inteiro: recusa ANTES da query. Um resultado vazio vindo de uma
      // query que rodou dependeria da RLS — e a RLS autoriza o instrutor.
      expect(touchedTraces()).toEqual([]);
    });
  });

  it('a URL direta de uma tentativa também é recusada sem consulta', async () => {
    // `/admin/replay/<uuid>` digitado à mão tem de cair na MESMA regra.
    expect(await fetchReplaySession('t1')).toBeNull();
    expect(touchedTraces()).toEqual([]);
  });
});

describe('🔒 aluno e autor também são recusados', () => {
  it.each([['learner'], ['author']] as const)('papel %s não consulta a tabela', async (role) => {
    callerMemberships = [{ tenantId: 'tenant-A', role }];
    expect(await listReplaySessions()).toEqual([]);
    expect(touchedTraces()).toEqual([]);
  });

  it('owner de tenant PESSOAL (plg-) não é superfície de admin', async () => {
    // O mesmo vazamento federado que `isTenantAdmin` já fecha: um aluno
    // auto-provisionado é `owner` do próprio tenant `plg-<uid>`.
    callerMemberships = [{ tenantId: 'tenant-plg', role: 'owner', isPersonal: true }];
    expect(await listReplaySessions()).toEqual([]);
    expect(touchedTraces()).toEqual([]);
  });
});

describe('✅ o admin do tenant do aluno assiste — e SÓ o tenant dele', () => {
  it('a query acontece e vem escopada nos alunos do tenant administrado', async () => {
    callerMemberships = [{ tenantId: 'tenant-A', role: 'tenant_admin' }];
    const rows = await listReplaySessions();

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      traceId: 't1',
      learnerName: 'Aluna A',
      enunciadoStatus: 'captured',
    });

    const traceQuery = touchedTraces();
    expect(traceQuery).toHaveLength(1);
    expect(traceQuery[0].filters['in:user_id']).toEqual(['learner-A', 'admin-A']);
  });

  it('🔴 admin de A + instrutor de B enxerga SÓ os alunos de A', async () => {
    // Sem o filtro explícito de `user_id`, o OR de policies do PostgREST
    // devolveria também o tenant onde ele é apenas instrutor. Este teste é o
    // que separa "um admin, olhando alguém" de "admin DO TENANT DO ALUNO".
    callerMemberships = [
      { tenantId: 'tenant-A', role: 'tenant_admin' },
      { tenantId: 'tenant-B', role: 'instructor' },
    ];
    tableRows.memberships = [{ user_id: 'learner-A' }];

    await listReplaySessions();

    const membershipQuery = recorded.find((r) => r.table === 'memberships');
    expect(membershipQuery?.filters['eq:tenant_id']).toBe('tenant-A');
    expect(touchedTraces()[0].filters['in:user_id']).toEqual(['learner-A']);
  });

  it('uma tentativa fora do escopo devolve null sem revelar que existe', async () => {
    callerMemberships = [{ tenantId: 'tenant-A', role: 'tenant_admin' }];
    tableRows.activity_traces = [];
    expect(await fetchReplaySession('trace-de-outro-tenant')).toBeNull();
    // A query rodou, mas com o `in(user_id)` — "não existe" e "não é seu"
    // devolvem a mesma resposta, de propósito.
    expect(touchedTraces()[0].filters['in:user_id']).toEqual(['learner-A', 'admin-A']);
  });
});

/* ── As fronteiras estruturais, varridas na fonte ─────────────────────────── */

function sourcesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourcesUnder(full));
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const REPLAY_SOURCES = [
  'src/services/replay.service.ts',
  'src/utils/replaySession.ts',
  'src/hooks/useReplay.ts',
  'src/pages/admin/ReplayPage.tsx',
  'src/pages/admin/ReplaySessionPage.tsx',
].map((p) => path.join(ROOT, p));

describe('o replay é READ-ONLY, estruturalmente', () => {
  it.each(['.insert(', '.update(', '.upsert(', '.delete('])(
    'nenhum arquivo do replay contém %s',
    (needle) => {
      const offenders = REPLAY_SOURCES.filter((f) => readFileSync(f, 'utf-8').includes(needle));
      expect(offenders.map((f) => path.relative(ROOT, f))).toEqual([]);
    }
  );

  it('nenhum arquivo do replay instancia um cliente com service_role', () => {
    // Regex sobre USO, nunca sobre prosa: o cabeçalho do `replay.service` cita
    // `service_role` exatamente para dizer que não o usa, e um match de
    // substring cru acusaria o arquivo que mais respeita a regra — a mesma
    // armadilha que `traceEmissionBoundary` já documenta.
    for (const file of REPLAY_SOURCES) {
      const src = readFileSync(file, 'utf-8');
      expect(src, path.relative(ROOT, file)).not.toMatch(/SERVICE_ROLE|createClient\s*\(/);
    }
  });

  it('nenhum arquivo do replay importa o caminho de persistência', () => {
    for (const file of REPLAY_SOURCES) {
      expect(readFileSync(file, 'utf-8')).not.toMatch(/from\s*['"]@\/services\/progress\.service['"]/);
    }
  });
});

describe('🔴 o spec ATUAL da atividade nunca é apresentado como captura', () => {
  // ⚠️ ESTE BLOCO MUDOU DE REGRA EM 2026-08-04, e a diferença importa.
  //
  // Antes ele exigia `activities(kind)` — o embed NÃO podia trazer o `spec`, de
  // modo que a tela era incapaz de renderizar o texto de hoje. Custou caro: 43
  // das 45 tentativas gravadas são anteriores ao `spec_snapshot`, e todas elas
  // mostravam um painel vazio, sem nada para assistir.
  //
  // A invariante agora é OUTRA, e é mais forte do que "não leia": o spec de hoje
  // pode ser lido, mas só pode sair pelo braço `inferred` da união — nunca como
  // `captured`, nunca fundido com um snapshot, e nunca escrito de volta. Isso é
  // provado por comportamento em `replaySession.test.ts`; o que sobra aqui são
  // as fronteiras que ainda são estruturais.
  it('o embed nomeia as colunas, e `spec` está entre elas deliberadamente', () => {
    const service = readFileSync(path.join(ROOT, 'src/services/replay.service.ts'), 'utf-8');
    expect(service).toMatch(/activities\(kind,\s*spec\)/);
    // Continua sendo um embed nomeado coluna a coluna: um `activities(*)` faria
    // a superfície crescer campos sem diff visível.
    expect(service).not.toMatch(/activities\(\*\)/);
    expect(service).not.toMatch(/from\('activities'\)/);
  });

  it('🔴 o replay NUNCA escreve `spec_snapshot` — a inferência não vira registro', () => {
    // O ponto inteiro da coluna é significar "o que o aluno leu". Gravar ali uma
    // reconstrução tornaria inferência e captura indistinguíveis para sempre.
    for (const file of REPLAY_SOURCES) {
      const src = readFileSync(file, 'utf-8');
      expect(src, path.relative(ROOT, file)).not.toMatch(/spec_snapshot\s*:/);
    }
  });

  it('a tela do replay não consulta a tabela `activities`', () => {
    for (const file of REPLAY_SOURCES) {
      expect(readFileSync(file, 'utf-8')).not.toMatch(/from\('activities'\)/);
    }
  });

  it('nenhum outro módulo além do replay lê `activity_traces`', () => {
    // Um segundo leitor nasceria fora deste portão — e o portão é a decisão.
    const readers = sourcesUnder(path.join(ROOT, 'src'))
      .filter((f) => !f.includes(`${path.sep}test${path.sep}`))
      .filter((f) => readFileSync(f, 'utf-8').includes("from('activity_traces')"))
      .map((f) => path.relative(ROOT, f))
      .sort();
    expect(readers).toEqual(['src/services/progress.service.ts', 'src/services/replay.service.ts']);
  });
});
