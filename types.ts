
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
  PROFILE,
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

export interface EquipmentItem {
    name: string;
    description: string;
    equipped: boolean;
}

export interface SkillItem {
    name: string;
    level: number;
    isActive: boolean;
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
  summary: string;
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
    summary: string;
    equipment: EquipmentItem[];
    skills: SkillItem[];
}

export interface SaveData {
    userSettings: UserSettings;
    history: GameState[];
    currentStepIndex: number;
    characterProfiles: CharacterProfile[];
    equipment: EquipmentItem[];
    skills: SkillItem[];
}

export interface PromptSuggestion {
    prompt: string;
    genre: string;
    worldDescription: string;
    keyCharacters: string[];
    keyEvents: string[];
    // Extended player-focused details for richer setup
    playerBackground: string;
    playerRole: string;
    playerSkills: string[];
    startingSituation: string;
    // Further extensions
    playerAppearance: string;
    playerPersonality: string;
    playerEquipment: string[];
}

export interface ImageRecord {
    id: string; // UUID
    blob: Blob;
}
