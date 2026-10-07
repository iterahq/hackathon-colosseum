/**
 * A FRONTEIRA DE EMISSÃO — onde o trace de eventos pode e não pode nascer.
 *
 * Plan `20260731-itera-eventos-aprendizagem`, Fase 4. Este teste existe porque a
 * regra que ele tranca é invisível em runtime: quebrá-la não derruba nada, não
 * fica vermelho em lugar nenhum, e só aparece meses depois como dado de aluno
 * contaminado por autor testando atividade.
 *
 * ## A regra
 *
 * O trace é emitido DENTRO de `persistActivityProgress`, e em nenhum outro
 * lugar. Duas razões, e as duas são de correção:
 *
 *  1. **Cobertura.** Os call-sites do serviço não são mais os dois que o plano
 *     nomeou: a aula ao vivo E todo ERRO no self-paced passam pela fila durável
 *     (`writeOrQueue` → `useAnswerOutbox`), e só o ACERTO do self-paced chama
 *     direto. Instrumentar nos call-sites capturaria acerto de self-paced e
 *     mais nada — a forma exata do defeito da 0028, um log que só tem vitória e
 *     parece completo.
 *  2. **Contenção.** O `ActivityTestHarness` monta o MESMÍSSIMO
 *     `ActivityRenderer` que o aluno vê e deliberadamente não importa
 *     `progress.service` — é essa ausência que garante que o autor testando uma
 *     atividade não escreve nada. Emitir de dentro do renderer quebraria a
 *     garantia em silêncio.
 *
 * ## Por que varredura de fonte e não teste de comportamento
 *
 * O `activity-baseline` (56 cenários, gate bloqueante) já prova o lado
 * comportamental, e prova mais forte: durante um round-trip completo no harness
 * NENHUMA requisição sai da origem stub, então não há escrita a contar. Mas ele
 * só cobre o harness. Este teste cobre a árvore inteira de componentes de
 * atividade, custa milissegundos, e falha com o nome do arquivo culpado — o que
 * um teste de rede não faz.
 *
 * Mesma técnica de `sfxSelfHost` / `fontsSelfHost`: leitura de arquivo + string,
 * zero rede.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../..');

/** Todo `.ts`/`.tsx` sob um diretório, recursivo. */
function sourcesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourcesUnder(full));
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/** Módulos que só o caminho de persistência do ALUNO pode tocar. */
const FORBIDDEN = ['@/services/progress.service', '@/utils/learningTrace'];

/**
 * Casa só o IMPORT, nunca a prosa. O docblock do próprio `ActivityTestHarness`
 * cita `@/services/progress.service` para dizer que NÃO o importa — um match de
 * substring cru acusaria exatamente o arquivo que mais respeita a regra.
 */
function importsModule(source: string, mod: string): boolean {
  const escaped = mod.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`from\\s*['"]${escaped}['"]`).test(source);
}

/** A árvore que o harness do autor monta — nenhum arquivo aqui pode persistir. */
const ACTIVITY_TREE = [
  path.join(ROOT, 'src/components/branded/activity'),
  path.join(ROOT, 'src/components/author'),
];

describe('a árvore de atividades não conhece o caminho de persistência', () => {
  const files = ACTIVITY_TREE.flatMap(sourcesUnder);

  it('encontrou a árvore (um glob vazio passaria vacuamente)', () => {
    // Sem isto, renomear o diretório transformaria este teste num no-op verde.
    expect(files.length).toBeGreaterThan(20);
  });

  it.each(FORBIDDEN)('nenhum componente de atividade importa %s', (mod) => {
    const offenders = files.filter((f) => importsModule(readFileSync(f, 'utf-8'), mod));
    expect(
      offenders.map((f) => path.relative(ROOT, f)),
      `${mod} não pode ser importado da árvore de atividades: o ActivityTestHarness monta esses mesmos componentes, e um autor testando atividade passaria a gravar dado de aluno.`
    ).toEqual([]);
  });

  it('o ActivityTestHarness continua sem NENHUM import de escrita', () => {
    const harness = readFileSync(
      path.join(ROOT, 'src/components/author/ActivityTestHarness.tsx'),
      'utf-8'
    );
    for (const mod of [...FORBIDDEN, '@/services/artifact.service']) {
      expect(importsModule(harness, mod), `o harness passou a importar ${mod}`).toBe(false);
    }
  });
});

/**
 * A costura de GRAVAÇÃO (sub-plano 1, Fase A) fica de fora da regra acima por
 * construção, não por sorte — e isso precisa ser testado, senão "o recorder não
 * é um escritor" é só uma frase.
 *
 * A árvore de atividades importa `@/hooks/useActionRecorder`, e o recorder não
 * pode virar um segundo plano de dados. Ele PRODUZ um valor que sobe pelo
 * `onComplete`; quem escreve continua sendo o `progress.service`, chamado só
 * pelos players. Um recorder que aprendesse a falar com o Supabase mataria a
 * garantia do harness sem quebrar teste nenhum — daí este bloco.
 */
describe('o recorder de ações produz valor, nunca escreve', () => {
  const recorder = readFileSync(path.join(ROOT, 'src/hooks/useActionRecorder.ts'), 'utf-8');
  const families = readFileSync(path.join(ROOT, 'src/utils/activityFamilies.ts'), 'utf-8');

  it.each([
    '@/services/progress.service',
    '@/lib/supabase/client',
    '@/hooks/useAnswerOutbox',
    '@/utils/answerOutbox',
  ])('useActionRecorder não importa %s', (mod) => {
    expect(importsModule(recorder, mod), `o recorder passou a importar ${mod}`).toBe(false);
  });

  it('o registro de famílias é PURO — nem React, nem Supabase, nem persistência', () => {
    // É ele que a árvore de atividades importa para nomear `RecordedAction`; se
    // ganhar dependência, a fronteira acima passa a ser contornável por um
    // import que o teste considera inocente.
    for (const mod of [
      'react',
      '@/services/progress.service',
      '@/utils/learningTrace',
      '@/lib/supabase/client',
    ]) {
      expect(importsModule(families, mod), `activityFamilies passou a importar ${mod}`).toBe(false);
    }
  });
});

/**
 * O ELENCO DO ALUNO — a mesma fronteira, agora para o dado pessoal.
 *
 * A promessa da tela é literal: *"só você vê — instrutor e administrador não têm
 * acesso"*. A RLS da 0060 sustenta isso no banco; aqui trancamos os dois jeitos
 * de furar a promessa pelo cliente, e nenhum deles quebraria nada em runtime.
 */
describe('o elenco do aluno não vaza da máquina dele', () => {
  const files = ACTIVITY_TREE.flatMap(sourcesUnder);

  it.each(['@/services/personalization.service', '@/personalization/PersonalizationProvider'])(
    'nenhum componente de atividade importa %s',
    (mod) => {
      const offenders = files.filter((f) => importsModule(readFileSync(f, 'utf-8'), mod));
      expect(
        offenders.map((f) => path.relative(ROOT, f)),
        `${mod} é a camada de dados; a árvore de atividades só pode enxergar a PORTA pura, senão o harness do autor passa a carregar o cliente do Supabase junto.`
      ).toEqual([]);
    }
  );

  it.each([
    'src/components/author/ActivityTestHarness.tsx',
    'src/pages/author/UnitCanvasPage.tsx',
  ])('%s monta a atividade com a personalização DESLIGADA', (rel) => {
    // O provider envolve todas as rotas, e o autor está dentro delas: sem este
    // empurrão explícito, a superfície de autoria pede o nome da mãe do AUTOR e
    // grava na linha dele.
    const src = readFileSync(path.join(ROOT, rel), 'utf-8');
    expect(src).toContain('PERSONALIZATION_OFF');
  });
});

describe('a emissão do trace mora no serviço, não nos call-sites', () => {
  const service = readFileSync(path.join(ROOT, 'src/services/progress.service.ts'), 'utf-8');

  it('progress.service é quem escreve em activity_traces', () => {
    expect(service).toContain("from('activity_traces')");
  });

  /**
   * 🔱 O CONJUNTO DE PORTAS DE ENTRADA É FECHADO — acrescentado em 2026-08-05,
   * junto com a terceira delas.
   *
   * A regra do arquivo sempre foi "o trace nasce no `progress.service` e em
   * lugar nenhum". Ela continua de pé e nenhuma asserção acima foi afrouxada.
   * O que mudou é DENTRO do módulo: a escrita do trace saiu de dentro do
   * `persistActivityProgress` e virou `writeSettledTrace`, para que um
   * convidado possa ser OBSERVADO sem ser CREDITADO (Tainan, voz 2026-08-05:
   * *"convidado gera trace de aprendizagem, mas fica fora da análise"*).
   *
   * Essa extração é útil e é exatamente por isso que ela é perigosa: ela
   * transforma "gravar sequência sem gravar progresso" de impossível em
   * conveniente. Um caminho novo que chame `writeSettledTrace` sem escrever
   * `activity_results` produziria uma sequência sem tentativa por trás — um
   * trace dizendo que alguém respondeu enquanto o log de tentativas diz que
   * ninguém respondeu, que é pior que qualquer um dos dois registros sozinho.
   *
   * Então o conjunto de funções exportadas do módulo é FIXO aqui. Uma quarta
   * porta não quebra por acidente: ela quebra este teste, e quem a adicionar
   * tem de escrever nesta lista o que ela grava e o que ela deliberadamente
   * não grava.
   */
  it('🔱 o módulo expõe EXATAMENTE as portas conhecidas — uma quarta tem de se declarar', () => {
    const exported = [...service.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)]
      .map((m) => m[1])
      .sort();
    expect(exported).toEqual(
      [
        // escreve progress + activity_results + trace + XP
        'persistActivityProgress',
        // escreve SÓ o trace, de uma tentativa settlada por convidado (ADR-6:
        // nada de progress, nada de activity_results, nada de XP)
        'persistGuestActivityTrace',
        // escreve SÓ o trace, de uma tentativa aberta e largada (migration 0040)
        'persistActivityAbandonment',
        // leitura + função pura de retomada — não escrevem nada
        'fetchActivityProgress',
        'fetchActivityProgressOrNull',
        'resumeIndexFor',
        // LEITURA do próprio aluno, pra reabrir respondido o que ele já respondeu
        // (inclusive em outro aparelho): as tentativas mais recentes de
        // `activity_results` e a sequência do trace dela. Não escrevem nada.
        'fetchLatestAttempts',
        'fetchAnswerActions',
        // rebaixa `progress` de 'completed' pra 'in_progress' no reset da aula
        // ao vivo. NÃO escreve activity_results, NÃO escreve trace, NÃO mexe em
        // XP: a tentativa antiga aconteceu e o relatório do professor a lê.
        'reopenLessonProgress',
        // helper puro do payload de `feedback`
        'buildAttemptFeedback',
      ].sort()
    );
  });

  /**
   * A porta do convidado não pode virar um atalho para pular o progresso de um
   * aluno de verdade. Varredura de fonte porque a garantia é ESTRUTURAL: o
   * corpo da função não pode conter escrita nenhuma além do trace.
   */
  it('🔴 persistGuestActivityTrace não escreve progress, activity_results nem XP', () => {
    const start = service.indexOf('export async function persistGuestActivityTrace');
    expect(start, 'a função sumiu — o teste passaria vacuamente').toBeGreaterThan(0);
    const end = service.indexOf('\nexport async function ', start + 1);
    const body = service.slice(start, end === -1 ? undefined : end);

    for (const forbidden of [
      "from('progress')",
      "from('activity_results')",
      'awardActivityXp',
      "from('class_answers')",
    ]) {
      expect(body, `o caminho do convidado passou a tocar ${forbidden}`).not.toContain(forbidden);
    }
    // E ela realmente escreve o trace — senão a asserção acima passa por vazio.
    expect(body).toContain('writeSettledTrace');
  });

  it('e é o ÚNICO ESCRITOR — nenhum outro módulo escreve nessa tabela', () => {
    // Um segundo escritor não seria só duplicação: ele nasceria fora do funil,
    // logo fora da fila durável, logo perdendo justamente o tráfego offline.
    //
    // ⚠️ A checagem passou a distinguir ESCRITA de LEITURA em 2026-08-04, quando
    // o `replay.service` (Fase 1 do plano de replay) virou o primeiro LEITOR da
    // tabela — até então ninguém lia, e "toca a tabela" e "escreve na tabela"
    // eram a mesma coisa. Colapsar os dois de novo ou proibiria o replay ou
    // deixaria um escritor novo passar como leitor; por isso são duas asserções.
    const WRITE_VERBS = ['.insert(', '.update(', '.upsert(', '.delete('];
    const touching = sourcesUnder(path.join(ROOT, 'src'))
      .filter((f) => !f.includes(`${path.sep}test${path.sep}`))
      .filter((f) => readFileSync(f, 'utf-8').includes("from('activity_traces')"));

    const writers = touching
      .filter((f) => {
        const src = readFileSync(f, 'utf-8');
        return WRITE_VERBS.some((verb) => src.includes(verb));
      })
      .map((f) => path.relative(ROOT, f));
    expect(writers).toEqual(['src/services/progress.service.ts']);

    // E o conjunto de quem toca a tabela continua fechado e nomeado, para que um
    // módulo novo tenha de se declarar aqui em vez de aparecer sozinho.
    expect(touching.map((f) => path.relative(ROOT, f)).sort()).toEqual([
      'src/services/progress.service.ts',
      'src/services/replay.service.ts',
    ]);
  });
});

/**
 * 👤 A POLÍTICA DE CONVIDADO DE CADA CONSUMIDOR — acrescentado em 2026-08-05.
 *
 * ## Por que este bloco existe
 *
 * A partir de hoje `itera.activity_traces` contém linhas de CONVIDADO (Tainan,
 * voz 2026-08-05T16:44Z: *"Sim, convidado gera trace de aprendizagem, mas fica
 * fora da análise — só analytics interna. Então dá pra dar replay, mas não vai
 * pra analytics."*). A metade fácil dessa frase é a escrita. A difícil é esta:
 * qualquer agregado que passe a contá-las em silêncio recria exatamente o
 * defeito que o ADR-4 foi escrito para impedir — um número que parece medido e
 * é parcialmente encenado. **14 dos 20 convidados registrados são nomes de
 * staff/demo.**
 *
 * O `buildClassReport` já vive sob essa regra (ADR-4, provado em
 * `guestMetricsExclusion.test.ts`), mas ele lê `class_answers` e não esta
 * tabela. Um leitor NOVO de `activity_traces` não herda nada daquele teste.
 *
 * ## O que ele tranca
 *
 * Que a pergunta seja respondida EXPLICITAMENTE por consumidor, e não deixada
 * para o formato do `.in()` de alguém. O default é EXCLUIR — foi o que o Tainan
 * disse ("só analytics interna") — e a única exceção nomeada é o replay ("dá pra
 * dar replay"), que pode sê-lo porque já é admin-only e escopado por tenant.
 *
 * ⚠️ A EXCLUSÃO DE HOJE É ACIDENTAL EM TODA PARTE, E ISSO É O RISCO. Nem o
 * `replay.service`, nem o `admin.service` (Engagement/Completion) filtram
 * `is_guest`: eles escopam por `itera.memberships`, e um convidado não tem
 * nenhuma (migration 0026, ADR-4 — "esse conjunto vazio É a fronteira de
 * segurança do convidado"). Ou seja, todo mundo hoje exclui convidado como
 * EFEITO COLATERAL de como o escopo é computado, não porque alguém decidiu.
 * No dia em que o modelo de convidado ganhar uma membership sintética — e o
 * ADR-7 mantém aberto o caminho de promoção — a exclusão some sem quebrar nada.
 * Esta lista é o lugar onde isso vira uma decisão registrada.
 */
describe('👤 todo leitor de activity_traces declara sua política de convidado', () => {
  /**
   * módulo → política. `include` precisa de justificativa; `exclude` é o default
   * e é o que uma entrada nova deve ser salvo decisão em contrário do Tainan.
   */
  const GUEST_POLICY: Record<string, 'include' | 'exclude'> = {
    // ✅ INCLUI. A superfície de replay é a metade "dá pra dar replay" da
    // resposta. Segura de incluir porque já é admin-only e escopada no tenant
    // (`replayAdminOnly.test.ts`), e porque todo convidado incluído é MARCADO
    // (`isGuest`) até a tela. Não alimenta nenhum agregado: o replay conta uma
    // tentativa por vez.
    'src/services/replay.service.ts': 'include',
  };

  const readers = sourcesUnder(path.join(ROOT, 'src'))
    .filter((f) => !f.includes(`${path.sep}test${path.sep}`))
    .map((f) => path.relative(ROOT, f))
    .filter((rel) => rel !== 'src/services/progress.service.ts')
    .filter((rel) => readFileSync(path.join(ROOT, rel), 'utf-8').includes("from('activity_traces')"))
    .sort();

  it('a lista de políticas cobre TODOS os leitores, e só eles', () => {
    // Um leitor novo sem entrada aqui quebra este teste — que é o ponto. Ele
    // não pode nascer sem que alguém escreva se conta convidado ou não.
    expect(readers).toEqual(Object.keys(GUEST_POLICY).sort());
  });

  it('✅ o replay UNE os convidados do tenant ao escopo, deliberadamente', () => {
    // Sem isto a inclusão seria só uma frase no cabeçalho: o escopo é montado a
    // partir de `itera.memberships`, onde o convidado não aparece por
    // construção, então incluí-lo exige um segundo lookup EXPLÍCITO.
    const svc = readFileSync(path.join(ROOT, 'src/services/replay.service.ts'), 'utf-8');
    expect(svc).toContain("from('class_guests')");
    // …e marca quem é convidado até a superfície. Incluir sem marcar seria a
    // pior das três opções: uma demo de vendas parecendo aluno.
    expect(svc).toMatch(/isGuest/);
  });

  it('🔴 nenhuma superfície de ANALYTICS lê a tabela', () => {
    // O relatório de turma (`buildClassReport`, ADR-4) e as páginas de
    // Engagement/Completion (`admin.service`) são os agregados do produto. Eles
    // leem `class_answers` / `activity_results` / `progress` — e a hora em que
    // um deles aprender a ler `activity_traces` é a hora em que o convidado
    // entra num total sem ninguém pedir.
    for (const rel of [
      'src/utils/buildClassReport.ts',
      'src/services/classReport.service.ts',
      'src/services/admin.service.ts',
    ]) {
      const src = readFileSync(path.join(ROOT, rel), 'utf-8');
      expect(src, `${rel} passou a ler activity_traces`).not.toContain("from('activity_traces')");
    }
  });

  it('🔴 `flattenTraceEvents` continua sem call-site — o gancho de analytics ainda não existe', () => {
    // Exportada e hoje NÃO CHAMADA em lugar nenhum: é o ponto onde uma análise
    // sobre traces vai plugar (plano LCPWCI). No dia em que ganhar um chamador,
    // esse chamador é um consumidor novo e precisa de uma linha em
    // GUEST_POLICY — com `exclude`, salvo decisão em contrário. Este teste é o
    // alarme.
    //
    // Casa o IMPORT e nunca a prosa: `pedagogicalContext.ts` CITA a função num
    // comentário, e um match de substring cru acusaria um arquivo que não a
    // chama — a mesma armadilha que `importsModule` já documenta acima.
    const IMPORTS_FLATTEN =
      /import[\s\S]{0,200}?\bflattenTraceEvents\b[\s\S]{0,200}?from\s*['"]@\/utils\/learningTrace['"]/;
    const callers = sourcesUnder(path.join(ROOT, 'src'))
      .filter((f) => !f.includes(`${path.sep}test${path.sep}`))
      .filter((f) => IMPORTS_FLATTEN.test(readFileSync(f, 'utf-8')))
      .map((f) => path.relative(ROOT, f));
    expect(callers).toEqual([]);
  });
});
