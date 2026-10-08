/** The glyphs the profile screen draws. React Native draws no SVG: the host answers each with its own node, or with none. */
export interface ProfileIcon {
  readonly kind: 'revert' | 'upload' | 'learn-photo' | 'external';
}

/** A picture the screen asks its host to draw (the web keeps its own element). Absent: the screen draws it itself. */
export interface ProfileImage {
  readonly kind: 'preview' | 'preset';
  readonly uri: string;
  readonly label: string;
}

/** The identity form, already decided: the screen computes nothing. */
export interface ProfileFormView {
  readonly name: string;
  readonly email: string | null;
  /** Empty: the initials are drawn. */
  readonly avatarUrl: string;
  readonly initials: string;
  /** The bundled icons to pick from. Empty where the host cannot draw them: the picker is left out. */
  readonly presets: readonly string[];
  readonly canSave: boolean;
  readonly canRevert: boolean;
  readonly saving: boolean;
  readonly saved: boolean;
  readonly saveFailed: boolean;
  readonly uploading: boolean;
  readonly uploadFailed: boolean;
}

export type ProfileFormState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error' }
  | { readonly kind: 'ready'; readonly form: ProfileFormView };

export interface PersonalizationFieldView {
  readonly id: string;
  readonly label: string;
  readonly placeholder: string;
  readonly value: string;
  readonly numeric: boolean;
}

/** The cast the exercises use, as the learner edits it. */
export interface PersonalizationView {
  readonly fields: readonly PersonalizationFieldView[];
  readonly canSave: boolean;
  readonly saving: boolean;
  readonly saved: boolean;
}
