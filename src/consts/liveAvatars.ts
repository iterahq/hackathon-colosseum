/**
 * Preset avatar choices for the pre-class name+avatar step — the learner picks
 * one instead of uploading a photo. DiceBear 'fun-emoji' SVGs (deterministic by
 * seed, CDN-served); LiveAvatar falls back to the name initial if one fails.
 */
const DICEBEAR = 'https://api.dicebear.com/9.x/fun-emoji/svg?seed=';

export const LIVE_AVATAR_PRESETS: string[] = [
  `${DICEBEAR}Foguete`,
  `${DICEBEAR}Estrela`,
  `${DICEBEAR}Robo`,
  `${DICEBEAR}Gato`,
  `${DICEBEAR}Onda`,
  `${DICEBEAR}Raio`,
  `${DICEBEAR}Coracao`,
  `${DICEBEAR}Planeta`,
  `${DICEBEAR}Fogo`,
  `${DICEBEAR}Trevo`,
  `${DICEBEAR}Sol`,
  `${DICEBEAR}Lua`,
];
