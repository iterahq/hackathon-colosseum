export type CollectionKind = 'passports' | 'medals' | 'companions';

export const COLLECTIONS: Record<CollectionKind, { configKey: string; name: string }> = {
  passports: { configKey: 'collection_passports', name: 'Itera Certifications' },
  medals: { configKey: 'collection_medals', name: 'Itera Medals' },
  companions: { configKey: 'collection_companions', name: 'Itera Companions' },
};
