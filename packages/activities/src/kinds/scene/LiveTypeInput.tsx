import type { RefObject } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { SCENE_CODE_COLORS } from './sceneTheme.js';

const PULSE = ['0 0 0 1px rgba(63,209,127,.3)', '0 0 0 4px rgba(63,209,127,.12)', '0 0 0 1px rgba(63,209,127,.3)'];

/** The learner types INSIDE the tag: an input sized to its own text, between `<tag>` and `</tag>`. */
export function LiveTypeInput({
  inputRef,
  value,
  onChange,
  solved,
  label,
}: {
  inputRef: RefObject<HTMLInputElement>;
  value: string;
  onChange: (value: string) => void;
  solved: boolean;
  label: string;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.span
      className="relative inline-flex rounded-sm"
      animate={solved || reduced ? { boxShadow: '0 0 0 0px rgba(63,209,127,0)' } : { boxShadow: PULSE }}
      transition={{ duration: 1.6, repeat: solved ? 0 : Infinity }}
    >
      <input
        ref={inputRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        readOnly={solved}
        size={Math.max(value.length, 1)}
        aria-label={label}
        spellCheck={false}
        data-testid="live-type-input"
        className="bg-evergreen/10 outline-none px-0.5 caret-evergreen"
        style={{ color: SCENE_CODE_COLORS.text, fontFamily: 'inherit', fontSize: 'inherit' }}
      />
    </motion.span>
  );
}
