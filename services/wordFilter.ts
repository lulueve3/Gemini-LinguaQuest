import { SavedVocabularyItem } from '../types';

export type VocabularyFilter = 'all' | 'today' | 'remembered' | 'normal' | 'difficult';

const isToday = (dateStr: string): boolean => {
  const date = new Date(dateStr);
  const now = new Date();
  return date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
};

export function filterVocabulary(items: SavedVocabularyItem[], filter: VocabularyFilter): SavedVocabularyItem[] {
  switch (filter) {
    case 'today':
      return items.filter(i => isToday(i.dateAdded));
    case 'remembered':
      return items.filter(i => i.correctCount > i.incorrectCount);
    case 'normal':
      return items.filter(i => (
        i.correctCount === 0 && i.incorrectCount === 0
      ) || Math.abs(i.correctCount - i.incorrectCount) <= 1);
    case 'difficult':
      return items.filter(i => i.incorrectCount > i.correctCount);
    case 'all':
    default:
      return items;
  }
}
