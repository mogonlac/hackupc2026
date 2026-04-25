import { useEffect, useState } from 'react';

const PREFIX = 'slap.';

function read(key, initial) {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    if (raw == null) return initial;
    return JSON.parse(raw);
  } catch {
    return initial;
  }
}

function write(key, value) {
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* quota / disabled storage — silently ignore */
  }
}

export function usePersistedState(key, initial) {
  const [value, setValue] = useState(() => read(key, initial));
  useEffect(() => { write(key, value); }, [key, value]);
  return [value, setValue];
}
