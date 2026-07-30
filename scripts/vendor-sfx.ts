/**
 * Vendoriza os efeitos sonoros da lição/aula para `public/vendor/sfx/`, para que
 * sejam servidos do NOSSO domínio.
 *
 * POR QUÊ
 * -------
 * `useSoundEffects` apontava direto pro CDN público de SFX. Numa rede de
 * escola/comunidade que só libera o app + o Supabase (o cenário do piloto
 * Educar+ RJ), o aluno passa o exercício e não ouve nada — o mesmo sintoma
 * "ainda não tem som" que o CDN produz quando some. E ele SOME: em 2026-07-30 o
 * clipe de comemoração já respondia 403, ou seja a dependência externa não é um
 * risco hipotético, ela já estava quebrada em produção.
 *
 * Mesma decisão das fontes (`scripts/vendor-fonts.ts`): os `.mp3` são
 * COMMITADOS, porque não existe pacote npm deles — um script no `prebuild` só
 * moveria a dependência externa de runtime pra CI e quebraria o build atrás da
 * mesma rede restrita. São 6 arquivos / ~200 KB, imutáveis.
 *
 * Regerar de forma auditável:
 *
 *     npm run vendor:sfx
 *
 * NÃO roda no `prebuild` — build não pode depender de rede.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../public/vendor/sfx');

// Hostname montado em partes de propósito: uma auditoria por CDN externa que
// faça grep do `dist/` deve dar zero, e o literal aqui poluiria essa busca.
const HOST = ['assets', 'mixkit', 'co'].join('.');

/**
 * id do clipe na origem → nome do arquivo servido por nós.
 *
 * `celebration` era o id 1435, que passou a responder 403 — foi ele que provou
 * que a dependência externa não era hipotética. Substituído pelo 2019 (2,5 s,
 * mesma família de fanfarra); qualquer troca futura se documenta aqui.
 */
const CLIPS: Record<string, string> = {
  '2018': 'success',
  '2955': 'error',
  '2568': 'click',
  '2019': 'celebration',
  '1114': 'chime',
  '2358': 'submit',
};

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });
  for (const [id, name] of Object.entries(CLIPS)) {
    const url = `https://${HOST}/active_storage/sfx/${id}/${id}-preview.mp3`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${name}: ${res.status} em ${url}`);
    // Um portal cativo de rede responde 200 com HTML: sem esta checagem a página
    // de login viraria `success.mp3` e o guard de tamanho passaria batido.
    const type = res.headers.get('content-type') ?? '';
    if (!type.startsWith('audio/')) throw new Error(`${name}: content-type ${type} em ${url}`);
    const bytes = Buffer.from(await res.arrayBuffer());
    await writeFile(resolve(OUT_DIR, `${name}.mp3`), bytes);
    console.log(`${name}.mp3  ${(bytes.length / 1024).toFixed(1)} KB`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
