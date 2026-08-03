import loader from '@monaco-editor/loader';
import { waitFor } from 'storybook/test';

/**
 * Espera o Monaco terminar de subir — INCLUSIVE o worker de linguagem — antes
 * de um `play` de browser-mode devolver o controle.
 *
 * ── O BUG QUE ISTO CONSERTA ────────────────────────────────────────────────
 * O `play` das stories `code` clica em "Enviar" e espera o veredito voltar do
 * iframe de preview. Isso resolve em ~1–3 s. O Monaco, montado no MESMO
 * canvas, leva mais que isso: ele carrega o `editor.main.js`, cria o modelo
 * `.tsx` e SÓ ENTÃO sobe o worker de TypeScript, que faz `importScripts` de um
 * arquivo de **6,7 MB** (`/vendor/monaco/vs/assets/ts.worker-*.js`).
 *
 * Quando o `play` retornava antes disso, o Vitest desmontava a story, o worker
 * era terminado no meio do download e o browser lançava
 * `NetworkError: Failed to execute 'importScripts' on 'WorkerGlobalScope'`.
 * Ninguém tinha handler para esse erro, então ele virava **unhandled error**.
 *
 * E aí vem a parte que fazia disso um FLAKE em vez de uma falha honesta: o
 * efeito do erro dependia só de TIMING. Se ele caísse na janela de um arquivo
 * de teste em execução, o Vitest o contabilizava em "Unhandled Errors" e a run
 * inteira saía com `exit 1` (com os testes PASSANDO — foi exatamente esse o
 * formato do vermelho do job `browser-mode` na `main`). Se caísse no intervalo
 * entre dois arquivos, virava só uma linha de log e a run passava. Medido
 * localmente antes deste fix: **4 de 12 runs** emitiam o erro.
 *
 * ── POR QUE ESPERAR ISTO, E NÃO UM TEMPO ───────────────────────────────────
 * `getTypeScriptWorker()` só resolve depois que o cliente do worker existe, o
 * que por definição exige que o `importScripts` tenha COMPLETADO. Ou seja: a
 * espera é pela condição real ter acontecido, não por um prazo em que se torce
 * para que ela aconteça. Se o worker genuinamente não subir, isto estoura o
 * `testTimeout` e o teste fica VERMELHO — que é o comportamento certo, e o
 * mesmo princípio dos guards `monacoSelfHost.test.ts` / `fontsSelfHost.test.ts`
 * deste repo: harness quebrado tem que aparecer, não ser silenciado.
 *
 * Chamar isto também não inventa trabalho novo: o worker já ia subir de
 * qualquer jeito (é ele que dá as squiggles de sintaxe ao aluno). A única
 * mudança é que a story não desmonta mais NO MEIO da subida.
 */
export async function settleMonacoLanguageWorker(): Promise<void> {
  const monaco = await loader.init();
  // O modo TypeScript é registrado por `onLanguage('typescript')`, que dispara
  // quando o primeiro modelo `.tsx` nasce — pode ainda não ter rodado quando
  // chegamos aqui. `getTypeScriptWorker()` REJEITA ("TypeScript not
  // registered!") nesse intervalo, então o `waitFor` re-tenta até registrar.
  const getWorker = await waitFor(() => monaco.languages.typescript.getTypeScriptWorker());
  await getWorker();
}
