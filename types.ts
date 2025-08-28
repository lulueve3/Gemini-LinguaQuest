
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
    quantity?: number; // For items/currency; default 1
}

export interface SkillItem {
    name: string;
    level: number;
    description?: string; // Short description of effect
    equipped?: boolean; // Replaces isActive terminology
    // Backward-compat: isActive may still come from AI/schema
    isActive?: boolean;
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
  characterStatus?: CharacterStatus; // Optional per-step status
  applyChangeActionsUsed?: number; // Per-step usage counter
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
    characterStatus?: CharacterStatus;
}

export interface SaveData {
    userSettings: UserSettings;
    history: GameState[];
    currentStepIndex: number;
    characterProfiles: CharacterProfile[];
    equipment: EquipmentItem[];
    skills: SkillItem[];
}

export interface CharacterStatus {
    health?: number; // 0-100
    stamina?: number; // 0-100
    morale?: number; // 0-100
    conditions?: string[]; // e.g., "poisoned", "fatigued"
    notes?: string; // free-form context notes
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
