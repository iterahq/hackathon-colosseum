export type CollectionKind = 'passports' | 'medals';

export const COLLECTIONS: Record<CollectionKind, { configKey: string; name: string }> = {
  passports: { configKey: 'collection_passports', name: 'Itera Passports' },
  medals: { configKey: 'collection_medals', name: 'Itera Medals' },
};
