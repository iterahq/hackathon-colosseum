/**
 * Guarda de regressão: os efeitos sonoros NUNCA podem voltar a ser buscados de
 * CDN pública em runtime.
 *
 * Contexto do bug que este teste tranca: `useSoundEffects` apontava pros `.mp3`
 * do CDN de SFX. Na rede de escola do piloto Educar+ (só o app + o Supabase
 * liberados) o aluno passa o exercício e não ouve nada — exatamente o sintoma
 * "ainda não tem som" reportado. E a origem não é estável: em 2026-07-30 o
 * clipe de comemoração respondia 403.
 *
 * Espelha `fontsSelfHost.test.ts`. Tudo aqui é leitura de arquivo + string,
 * nenhuma chamada de rede. Regerar os arquivos: `npm run vendor:sfx`.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../..');
const SFX_DIR = path.join(ROOT, 'public/vendor/sfx');
const hook = readFileSync(path.join(ROOT, 'src/hooks/useSoundEffects.ts'), 'utf-8');

const NAMES = ['success', 'error', 'click', 'celebration', 'chime', 'submit'];

describe('efeitos sonoros self-hosted', () => {
  it('o hook não referencia nenhuma URL absoluta', () => {
    expect(hook).not.toMatch(/https?:\/\//);
  });

  it('todo som declarado aponta para /vendor/sfx', () => {
    for (const name of NAMES) {
      expect(hook).toContain(`${name}: '/vendor/sfx/${name}.mp3'`);
    }
  });

  it('os arquivos existem e são MP3 de verdade', () => {
    for (const name of NAMES) {
      const file = path.join(SFX_DIR, `${name}.mp3`);
      expect(existsSync(file), `${name}.mp3 ausente — rode npm run vendor:sfx`).toBe(true);
      expect(statSync(file).size).toBeGreaterThan(1024);
      // Tamanho não basta: um portal cativo devolve uma página HTML bem maior
      // que isso. Só o cabeçalho (ID3 ou frame sync) prova que é áudio.
      const head = readFileSync(file).subarray(0, 3);
      const isMp3 = head.toString('latin1') === 'ID3' || (head[0] === 0xff && (head[1] & 0xe0) === 0xe0);
      expect(isMp3, `${name}.mp3 não parece um MP3`).toBe(true);
    }
  });
});
