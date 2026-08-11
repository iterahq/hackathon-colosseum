/**
 * Personalização por PREENCHIMENTO — a via rápida do "conteúdo com a cara do
 * aluno".
 *
 * O BYOC gerativo pede uma seed e manda um LLM ESCREVER a atividade inteira:
 * mede 26–73s por atividade. Numa aula onde quase toda atividade quer o nome de
 * alguém da família do aluno, isso é caro e frágil sem precisar ser — o autor já
 * escreveu o enunciado; o que falta é UM nome no lugar certo.
 *
 * Aqui o autor escreve `{{familiar.nome}}` no texto, o aluno preenche o elenco
 * UMA vez, e a troca é síncrona, determinística e offline. Zero chamada de
 * modelo, zero espera.
 *
 * ## Por que `{{ }}` e não `{ }`
 *
 * `{seed}` de chave simples já significa outra coisa no harness do BYOC, e
 * atividade de `code` é feita de chave: `{`, `${}`, objeto literal. Chave dupla
 * em volta de um id PONTUADO de um vocabulário FECHADO torna colisão acidental
 * praticamente impossível.
 *
 * ## Token desconhecido sobrevive VERBATIM
 *
 * Errar o nome do campo é erro de autoria, e apagar o token deixaria a frase
 * mutilada sem dizer por quê. Deixando literal, o autor vê no harness e o aluno
 * no máximo lê uma chave — nunca um fato inventado sobre a família dele.
 */

import type {
  PersonalizationField,
  PersonalizationFieldKind,
  PersonalizationValues,
} from '@/types/personalization';

/** Quem o elenco pode nomear. Vocabulário FECHADO — token fora daqui não troca. */
export const PERSONALIZATION_FIELDS: readonly PersonalizationField[] = [
  { id: 'eu.nome', labelKey: 'euNome', kind: 'text', fallback: 'Alex' },
  { id: 'eu.idade', labelKey: 'euIdade', kind: 'age', fallback: '15' },
  { id: 'eu.profissao', labelKey: 'euProfissao', kind: 'text', fallback: 'estudante' },
  { id: 'familiar.nome', labelKey: 'familiarNome', kind: 'text', fallback: 'Ana' },
  { id: 'familiar.parentesco', labelKey: 'familiarParentesco', kind: 'text', fallback: 'mãe' },
  { id: 'familiar.profissao', labelKey: 'familiarProfissao', kind: 'text', fallback: 'professora' },
  { id: 'familiar.idade', labelKey: 'familiarIdade', kind: 'age', fallback: '42' },
  { id: 'amigo.nome', labelKey: 'amigoNome', kind: 'text', fallback: 'Bia' },
  { id: 'amigo.profissao', labelKey: 'amigoProfissao', kind: 'text', fallback: 'estudante' },
  { id: 'amigo.idade', labelKey: 'amigoIdade', kind: 'age', fallback: '16' },
  { id: 'assunto.dominio', labelKey: 'assuntoDominio', kind: 'phrase', fallback: 'futebol' },
];

const FIELD_BY_ID = new Map(PERSONALIZATION_FIELDS.map((f) => [f.id, f]));

/**
 * Chave reservada: o aluno RECUSOU responder. Mora no MESMO jsonb do elenco
 * porque recusa que só vive em memória é a mesma pergunta outra vez a cada
 * reload. Não é campo — não entra no formulário nem em `missingFields`.
 */
export const DISMISSED_KEY = '_dismissed';

const TOKEN = /\{\{\s*([a-z]+\.[a-z]+)\s*\}\}/g;

/**
 * O valor do aluno vira TEXTO, nunca marcação. Só letra (com acento), dígito,
 * espaço, hífen e apóstrofo passam — o resto sai. Isso mata de uma vez o `**`
 * que viraria negrito no RichText, a crase que viraria código e qualquer coisa
 * que pudesse escapar de um atributo se o autor puser o token num `imageUrl`.
 *
 * O apóstrofo vira o TIPOGRÁFICO (`’`), e isso não é capricho: o token também
 * cai no `starter` de uma atividade de `code`, quase sempre dentro de aspas
 * simples. `'O'Brien'` é SyntaxError — o aluno abriria o editor já quebrado,
 * por causa do sobrenome dele.
 */
export function sanitizePersonalizationValue(
  raw: string,
  kind: PersonalizationFieldKind = 'text'
): string {
  if (kind === 'age') return raw.replace(/\D/g, '').slice(0, 3);
  return raw
    .replace(/'/g, '’')
    .replace(/[^\p{L}\p{N} ’-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, kind === 'phrase' ? 80 : 40);
}

/**
 * A mesma limpeza, para o texto que está SENDO DIGITADO.
 *
 * A diferença é o espaço do fim. Saneando a cada tecla, o `.trim()` come o
 * espaço no instante em que ele é digitado — e nome composto vira impossível:
 * "Ana Maria" sai "AnaMaria". Aqui o espaço final sobrevive enquanto o aluno
 * digita; o valor que vai pro banco passa pelo saneador normal, que o remove.
 */
export function sanitizePersonalizationInput(
  raw: string,
  kind: PersonalizationFieldKind = 'text'
): string {
  const clean = sanitizePersonalizationValue(raw, kind);
  if (kind === 'age' || clean === '' || !/\s$/.test(raw)) return clean;
  return clean.length < (kind === 'phrase' ? 80 : 40) ? `${clean} ` : clean;
}

/** Ids do vocabulário citados neste texto, na ordem em que aparecem, sem repetir. */
export function tokensIn(text: string): string[] {
  const found: string[] = [];
  for (const [, id] of text.matchAll(TOKEN)) {
    if (FIELD_BY_ID.has(id) && !found.includes(id)) found.push(id);
  }
  return found;
}

/** Troca os tokens conhecidos pelo valor do aluno (ou pelo fallback do campo). */
export function fillTokens(text: string, values: PersonalizationValues): string {
  return text.replace(TOKEN, (whole, id: string) => {
    const field = FIELD_BY_ID.get(id);
    if (!field) return whole;
    const value = sanitizePersonalizationValue(values[id] ?? '', field.kind);
    return value === '' ? field.fallback : value;
  });
}

/** Toda string de um JSON qualquer, recursiva. Só folhas string mudam. */
function mapStrings<T>(node: T, fn: (s: string) => string): T {
  if (typeof node === 'string') return fn(node) as unknown as T;
  if (Array.isArray(node)) return node.map((n) => mapStrings(n, fn)) as unknown as T;
  if (node && typeof node === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node)) out[k] = mapStrings(v, fn);
    return out as T;
  }
  return node;
}

/** Toda string de um JSON qualquer, recursiva, SEM copiar nada. */
function visitStrings(node: unknown, fn: (s: string) => void): void {
  if (typeof node === 'string') return fn(node);
  if (Array.isArray(node)) return node.forEach((n) => visitStrings(n, fn));
  if (node && typeof node === 'object') {
    for (const v of Object.values(node)) visitStrings(v, fn);
  }
}

/** Ids que este spec pede, em qualquer profundidade. */
export function tokensInSpec(spec: unknown): string[] {
  const found: string[] = [];
  visitStrings(spec, (s) => {
    for (const id of tokensIn(s)) if (!found.includes(id)) found.push(id);
  });
  return found;
}

/** Campos que o spec pede e o aluno ainda não preencheu. */
export function missingFields(spec: unknown, values: PersonalizationValues): PersonalizationField[] {
  return tokensInSpec(spec)
    .filter((id) => (values[id] ?? '').trim() === '')
    .map((id) => FIELD_BY_ID.get(id) as PersonalizationField);
}

/** O spec com o elenco do aluno dentro. Devolve o MESMO objeto se não há token. */
export function personalizeSpec<T>(spec: T, values: PersonalizationValues): T {
  if (tokensInSpec(spec).length === 0) return spec;
  return mapStrings(spec, (s) => fillTokens(s, values));
}
