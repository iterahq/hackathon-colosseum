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

describe('a emissão do trace mora no serviço, não nos call-sites', () => {
  const service = readFileSync(path.join(ROOT, 'src/services/progress.service.ts'), 'utf-8');

  it('progress.service é quem escreve em activity_traces', () => {
    expect(service).toContain("from('activity_traces')");
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
