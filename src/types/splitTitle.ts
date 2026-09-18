/** Result of splitting a "Headline: subline" course title into two layers. */
export interface SplitTitle {
  headline: string;
  subline: string | null;
}
