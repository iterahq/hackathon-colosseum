import { useEffect, useState } from 'react';

/** The value after it has stopped changing for `ms`: keeps a typed number from firing one request per keystroke. */
export function useDebouncedValue<T>(value: T, ms = 450): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return settled;
}
