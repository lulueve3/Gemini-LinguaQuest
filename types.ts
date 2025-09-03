
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
    imageModel?: string; // Model used for image generation
    // Optional: world/gameplay tags to customize rules/attributes
    tags?: GameTag[];
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
    worldMeta?: WorldMeta; // Optional long-term world context
    // Optional relationships between player and known characters
    relationships?: RelationshipEdge[];
}

export interface CharacterStatus {
    health?: number; // 0-100
    stamina?: number; // 0-100
    morale?: number; // 0-100
    conditions?: string[]; // e.g., "poisoned", "fatigued"
    notes?: string; // free-form context notes
    // Extension: world-specific stats (e.g., mana, reputation)
    custom?: Record<string, number | string>;
}

export interface PromptSuggestion {
    prompt: string;
    genre: string;
    worldDescription: string;
    keyCharacters: string[];
    keyEvents: string[];
    // New world scaffolding for stronger consistency
    rulesAndSystems: string[]; // World rules, systems, magic, politics, tech
    charactersAndRoles: string[]; // Cast and role descriptors
    plotAndConflict: string[]; // Core plot beats and conflicts
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

// Long-term world context for guiding future steps
export interface WorldMeta {
    longTermSummary: string; // 1-3 sentences describing world/background themes
    keyEvents: string[]; // Canon events to keep consistent
    keyCharacters: string[]; // Important characters/factions to keep consistent
    // Extended world meta to ensure consistent storytelling
    rulesAndSystems?: string[];
    charactersAndRoles?: string[];
    plotAndConflict?: string[];
}

// World tags to compose systems and UIs
export enum GameTag {
    Romance = 'romance',
    Harem = 'harem',
    Combat = 'combat',
    Magic = 'magic',
    SchoolLife = 'school',
    SciFi = 'scifi',
}

// Relationship system for romance/harem and social-heavy worlds
export type RelationshipType =
  | 'friend'
  | 'rival'
  | 'romance'
  | 'family'
  | 'teammate'
  | 'mentor'
  | 'enemy'
  | 'haremCandidate';

export interface RelationshipEdge {
    with: string; // Character name (assume player <-> NPC)
    type: RelationshipType;
    affection?: number;   // 0-100
    trust?: number;       // 0-100
    jealousy?: number;    // 0-100 (useful for harem dynamics)
    loyalty?: number;     // 0-100
    notes?: string;
    lastUpdated?: string; // ISO string
}

// Schema description for dynamic character attributes
export type AttributeFieldKind = 'bar' | 'text';
export interface CharacterAttributeField {
    key: string;      // e.g., 'mana', 'reputation'
    label: string;    // e.g., 'Mana', 'Reputation'
    kind: AttributeFieldKind;
}
