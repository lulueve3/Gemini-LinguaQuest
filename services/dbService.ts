// Fix: Changed Dexie import from default to named to ensure correct class inheritance.
import { Dexie, type Table } from 'dexie';
import { UserSettings, CharacterProfile, ChoiceItem, VocabularyItem, SavedVocabularyItem } from '../types';

export interface HistoryStep {
    id?: number; // Auto-incrementing primary key
    story: string;
    translatedStory: string;
    choices: ChoiceItem[];
    vocabulary: VocabularyItem[];
    imageId: string; // Foreign key to the image blob
    selectedChoiceIndex?: number;
}

export interface ImageRecord {
    id: string; // UUID
    blob: Blob;
}

export interface SessionData {
    id: number; // Should always be 1 for the single session
    userSettings: UserSettings;
    currentStepIndex: number;
    characterProfiles: CharacterProfile[];
}

class LinguaQuestDB extends Dexie {
    session!: Table<SessionData, number>;
    history!: Table<HistoryStep, number>;
    images!: Table<ImageRecord, string>;
    notebook!: Table<SavedVocabularyItem, string>;

    constructor() {
        super('LinguaQuestDB');
        this.version(1).stores({
            session: 'id',
            history: '++id',
            images: 'id',
            notebook: 'id', // Use the custom string ID from the app
        });
    }
}

export const db = new LinguaQuestDB();

export async function clearAllData() {
    await db.transaction('rw', db.session, db.history, db.images, db.notebook, async () => {
        await db.session.clear();
        await db.history.clear();
        await db.images.clear();
        await db.notebook.clear();
    });
}