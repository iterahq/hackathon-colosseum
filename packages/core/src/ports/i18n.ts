/** One locale's strings, by key. */
export type Messages = Readonly<Record<string, string>>;

/** The i18n lookup a screen gets from its host. An unknown key comes back as the key. */
export type Translate = (key: string) => string;

/** The lookup of a host that has no i18n runtime of its own (the native shell). */
export const translatorOf =
  (messages: Messages): Translate =>
  (key) =>
    Object.prototype.hasOwnProperty.call(messages, key) ? messages[key] : key;
