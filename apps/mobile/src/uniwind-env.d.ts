// `className` on the React Native primitives (Uniwind). Metro also writes uniwind-types.d.ts
// (gitignored); this reference makes tsc work without it.
/// <reference types="uniwind/types" />

// The CSS entry is a side-effect import; Metro (Uniwind) handles it.
declare module '*.css';
