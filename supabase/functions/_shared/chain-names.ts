export type CollectionKind = 'passports' | 'medals' | 'companions' | 'avatars';

export const COLLECTIONS: Record<CollectionKind, { configKey: string; name: string }> = {
  passports: { configKey: 'collection_passports', name: 'Itera Certifications' },
  medals: { configKey: 'collection_medals', name: 'Itera Medals' },
  companions: { configKey: 'collection_companions', name: 'Itera Companions' },
  // Collectibles: the only collection whose assets are NOT frozen.
  avatars: { configKey: 'collection_avatars', name: 'Itera Avatars' },
};
