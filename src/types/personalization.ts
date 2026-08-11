/**
 * `phrase` existe porque um campo pode ser um PEDAÇO DE FRASE ("consertar
 * bicicleta"), não um nome. Ele sana igual a `text` — o que muda é só o teto,
 * que em 40 caracteres cortaria a frase no meio.
 */
export type PersonalizationFieldKind = 'text' | 'age' | 'phrase';

/** Um campo do elenco que o aluno preenche. `id` é o token; `fallback` entra quando vazio. */
export interface PersonalizationField {
  id: string;
  /** Sufixo da chave de i18n (`personalization.field.<labelKey>`). */
  labelKey: string;
  kind: PersonalizationFieldKind;
  fallback: string;
}

/** O que o aluno respondeu, por id de campo. */
export type PersonalizationValues = Record<string, string>;

/**
 * A porta que a árvore de atividades enxerga. `enabled` é falso quando não há
 * provider — harness do autor e story — e aí NADA é pedido a ninguém: o texto
 * renderiza com o fallback do campo.
 */
export interface PersonalizationPort {
  values: PersonalizationValues;
  /** Há provider e o elenco já chegou — ou seja, dá para gravar. */
  ready: boolean;
  /** Dá para PERGUNTAR agora? Falso também depois que o aluno dispensou. */
  mayAsk: boolean;
  save: (values: PersonalizationValues) => Promise<void>;
  /** Ele não quis responder. A aula segue com os fallbacks, sem perguntar de novo. */
  dismiss: () => void;
}
