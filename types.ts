
export enum LoadingState {
  IDLE,
  GENERATING_STORY,
  GENERATING_IMAGE,
  ERROR,
}

export enum AppScreen {
  SETUP,
  GAME,
  NOTEBOOK,
  API_KEY_MANAGER,
}

export interface UserSettings {
    prompt: string;
    genre: string;
    sourceLanguage: string;
    targetLanguage: string;
    animeStyle?: string;
    generateImages: boolean;
}

export interface VocabularyItem {
    word: string; 
    translation: string; 
}

export interface ChoiceItem {
    choice: string;
    translatedChoice: string;
}

export interface SavedVocabularyItem extends VocabularyItem {
    id: string;
    dateAdded: string;
    correctCount: number;
    incorrectCount: number;
}

export interface GameState {
  story: string; 
  translatedStory: string; 
  imageUrl: string; // Used for save file (base64)
  imageId?: string; // Used for DB reference
  choices: ChoiceItem[];
  vocabulary: VocabularyItem[];
  selectedChoiceIndex?: number;
}

export interface CharacterProfile {
    name: string;
    description: string;
}

export interface AdventureStep {
    story: string;
    translatedStory: string;
    imagePrompt: string;
    choices: ChoiceItem[];
    vocabulary: VocabularyItem[];
    characters: CharacterProfile[];
}

export interface SaveData {
    userSettings: UserSettings;
    history: GameState[];
    currentStepIndex: number;
    characterProfiles: CharacterProfile[];
}

export interface PromptSuggestion {
    prompt: string;
    genre: string;
    worldDescription: string;
    keyCharacters: string[];
    keyEvents: string[];
}

export interface ImageRecord {
    id: string; // UUID
    blob: Blob;
}