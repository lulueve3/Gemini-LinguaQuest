import { GameTag, CharacterAttributeField } from '../types';

// Compose character attribute schema based on world tags
export function buildCharacterSchema(tags?: GameTag[]): CharacterAttributeField[] {
  const t = new Set(tags || []);
  const fields: CharacterAttributeField[] = [];

  // Default: no stats unless tags selected

  // Fantasy
  if (t.has(GameTag.Fantasy)) {
    fields.push(
      { key: 'health', label: 'Health', kind: 'bar' },
      { key: 'stamina', label: 'Stamina', kind: 'bar' },
      { key: 'mana', label: 'Mana', kind: 'bar' },
      { key: 'morale', label: 'Morale', kind: 'bar' },
    );
  }

  // Magic (optional complement for fantasy worlds)
  if (t.has(GameTag.Magic)) {
    fields.push({ key: 'mana', label: 'Mana', kind: 'bar' });
  }

  // Sci-fi
  if (t.has(GameTag.SciFi)) {
    fields.push(
      { key: 'health', label: 'Health', kind: 'bar' },
      { key: 'stamina', label: 'Stamina', kind: 'bar' },
      { key: 'energy', label: 'Energy', kind: 'bar' },
      { key: 'morale', label: 'Morale', kind: 'bar' },
    );
  }

  // Romance / Harem
  if (t.has(GameTag.Romance) || t.has(GameTag.Harem)) {
    fields.push(
      { key: 'charm', label: 'Charm', kind: 'bar' },
      { key: 'heart', label: 'Heart', kind: 'bar' },
      { key: 'social', label: 'Social', kind: 'bar' },
    );
  }

  // School life
  if (t.has(GameTag.SchoolLife)) {
    fields.push(
      { key: 'social', label: 'Social', kind: 'bar' },
      { key: 'grades', label: 'Grades', kind: 'bar' },
      { key: 'stamina', label: 'Stamina', kind: 'bar' },
      { key: 'stress', label: 'Stress', kind: 'bar' },
    );
  }

  // Apocalypse
  if (t.has(GameTag.Apocalypse)) {
    fields.push(
      { key: 'health', label: 'Health', kind: 'bar' },
      { key: 'hunger', label: 'Hunger', kind: 'bar' },
      { key: 'thirst', label: 'Thirst', kind: 'bar' },
    );
  }

  // Combat
  if (t.has(GameTag.Combat)) {
    fields.push(
      { key: 'health', label: 'Health', kind: 'bar' },
      { key: 'stamina', label: 'Stamina', kind: 'bar' },
      { key: 'energy', label: 'Energy', kind: 'bar' },
      { key: 'weapon_proficiency', label: 'Weapon Proficiency', kind: 'bar' },
    );
  }

  // Adventure
  if (t.has(GameTag.Adventure)) {
    fields.push(
      { key: 'health', label: 'Health', kind: 'bar' },
      { key: 'stamina', label: 'Stamina', kind: 'bar' },
    );
  }

  // De-duplicate by key
  const seen = new Set<string>();
  return fields.filter(f => (seen.has(f.key) ? false : (seen.add(f.key), true)));
}
