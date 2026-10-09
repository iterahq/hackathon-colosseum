import { useState } from 'react';
import { usePassportSound } from '@/hooks/usePassportSound';

interface Props {
  value: string;
  label: string;
  doneLabel: string;
  display?: string;
}

/** A mono pill that copies `value` to the clipboard and confirms for two seconds. */
export function CopyButton({ value, label, doneLabel, display }: Props) {
  const [done, setDone] = useState(false);
  const sound = usePassportSound();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      sound('click', 0.2);
      setDone(true);
      window.setTimeout(() => setDone(false), 2000);
    } catch {
      setDone(false);
    }
  };
  return (
    <button
      type="button"
      onClick={() => void copy()}
      aria-label={label}
      className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-[#2E2A25] bg-[#1C1916] px-3 [font:500_12px_JetBrains_Mono] text-[#F4EDE2] hover:border-[#3FD17F] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3FD17F]"
    >
      <span>{done ? doneLabel : (display ?? label)}</span>
      <span aria-hidden>⧉</span>
    </button>
  );
}
