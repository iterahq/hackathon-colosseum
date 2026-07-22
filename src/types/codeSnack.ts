export interface CodeSnapshot {
  code: string;
  savedAt: string;
}

export interface UseCodeSnackCallbacks {
  onComplete: (correct: boolean) => void;
  /** Persist a debounced snapshot of the source. Defaults to the local snapshot store. */
  onAutosave?: (code: string) => void;
}

export interface TranspileResult {
  code?: string;
  error?: string;
}
