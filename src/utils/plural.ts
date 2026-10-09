type T = (key: string, vars?: Record<string, string | number>) => string;

/** "1 lição" / "3 lições": the noun lives in `count.<noun>.one` and `count.<noun>.other`. */
export const countOf = (t: T, n: number, noun: string): string => `${n} ${t(`count.${noun}.${n === 1 ? 'one' : 'other'}`)}`;
