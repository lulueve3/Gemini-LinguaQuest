import { GameTag, CharacterAttributeField } from '../types';

// Compose character attribute schema based on world tags
export function buildCharacterSchema(tags?: GameTag[]): CharacterAttributeField[] {
  const t = new Set(tags || []);
  const fields: CharacterAttributeField[] = [];

  // Always show core bars if present
  fields.push(
    { key: 'health', label: 'Health', kind: 'bar' },
    { key: 'stamina', label: 'Stamina', kind: 'bar' },
    { key: 'morale', label: 'Morale', kind: 'bar' },
  );

  // Magic worlds: mana/corruption
  if (t.has(GameTag.Magic)) {
    fields.push({ key: 'mana', label: 'Mana', kind: 'bar' });
    fields.push({ key: 'corruption', label: 'Corruption', kind: 'bar' });
  }

  // Sci-fi/tech: shield/energy
  if (t.has(GameTag.SciFi)) {
    fields.push({ key: 'shield', label: 'Shield', kind: 'bar' });
    fields.push({ key: 'energy', label: 'Energy', kind: 'bar' });
  }

  // Social/romance: reputation/charm
  if (t.has(GameTag.Romance) || t.has(GameTag.Harem) || t.has(GameTag.SchoolLife)) {
    fields.push({ key: 'reputation', label: 'Reputation', kind: 'bar' });
    fields.push({ key: 'charm', label: 'Charm', kind: 'bar' });
  }

  // De-duplicate by key
  const seen = new Set<string>();
  return fields.filter(f => (seen.has(f.key) ? false : (seen.add(f.key), true)));
}

