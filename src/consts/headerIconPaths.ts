export type HeaderIconName = 'flame' | 'bolt' | 'star' | 'trails' | 'courses' | 'passport' | 'files' | 'shop' | 'chevron' | 'copy' | 'external' | 'solana' | 'verify';

/** Glyphs drawn with a fill. */
export const HEADER_ICON_FILLED: Partial<Record<HeaderIconName, string>> = {
  flame: 'M12 2c.6 3.4 3.2 5 4.6 7.5A6.6 6.6 0 1 1 5.6 12c0-1.5.5-2.9 1.3-4 .4 1.3 1.2 2.1 2.1 2.4C8.8 7 10.2 4.2 12 2zm0 10.4c-1.6 1.6-2.4 2.8-2.4 4a2.4 2.4 0 1 0 4.8 0c0-1.2-.8-2.4-2.4-4z',
  bolt: 'M13 2 4 14h6l-1 8 9-12h-6z',
  star: 'm12 2 2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.2l-6.1 3.4 1.4-6.8L2.2 9.1l6.9-.8z',
  solana: 'M6.5 4h13l-3 3h-13zM6.5 10.5h13l-3 3h-13zM6.5 17h13l-3 3h-13z',
};

/** Glyphs drawn with a 2px stroke. */
export const HEADER_ICON_STROKED: Partial<Record<HeaderIconName, string>> = {
  trails: 'M5 8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zm14 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM7.5 6H14a4 4 0 0 1 0 8h-4a4 4 0 0 0 0 8',
  courses: 'M4 4h6a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4zM20 4h-6a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h7z',
  passport: 'M6.5 3h11A2.5 2.5 0 0 1 20 5.5v13a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 18.5v-13A2.5 2.5 0 0 1 6.5 3zM12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm-4 4h8',
  files: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  verify: 'M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6zM8.5 12l2.5 2.5 4.5-5',
  shop: 'M5 8h14l-1.2 11.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8zM9 8V7a3 3 0 0 1 6 0v1',
  chevron: 'm6 9 6 6 6-6',
  copy: 'M11 9h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2zM5 15V5a2 2 0 0 1 2-2h10',
  external: 'M14 4h6v6M20 4l-9 9M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5',
};
