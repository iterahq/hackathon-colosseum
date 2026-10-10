const BUCKET = 'https://nyzcbnnbffsizshiolbh.supabase.co/storage/v1/object/public/tera-avatars';

export const TERA_FALLBACK_IMAGE = '/mascot/tera-happy.webp';

/** Public avatar art until the backend publishes the URLs: 128 px thumbnail or the 512 px original. */
export const teraAvatarImage = (key: string, size: 'chip' | 'thumb' | 'full'): string =>
  `${BUCKET}/${key}${size === 'chip' ? '_chip' : size === 'thumb' ? '_128' : ''}.webp`;
