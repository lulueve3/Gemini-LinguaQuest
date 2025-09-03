
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { LoadingState, GameState, AppScreen, UserSettings, VocabularyItem, SavedVocabularyItem, SaveData, ChoiceItem, CharacterProfile, ImageRecord, EquipmentItem, SkillItem, WorldMeta, GameTag, RelationshipEdge } from './types';
import { generateAdventureStep, generateAdventureImage, translateWord } from './services/geminiService';
import { db, clearAllData, HistoryStep, SessionData } from './services/dbService';
import { speak, stop } from './services/ttsService';
import ChoiceButton from './components/ChoiceButton';
import LoadingSpinner from './components/LoadingSpinner';
import GameSetup from './components/GameSetup';
import NotebookView from './components/NotebookView';
import CharacterProfileView from './components/CharacterProfileView';
import Toast from './components/Toast';
import ApiKeyManager from './components/ApiKeyManager';
import apiKeyService from './services/apiKeyService';

const SESSION_ID = 1;
const STORAGE_WARNING_THRESHOLD_BYTES = 50 * 1024 * 1024; // 50MB

// Helper to convert Base64 to Blob
const base64ToBlob = (base64: string, mimeType: string): Blob => {
    const byteCharacters = atob(base64.split(',')[1]);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
};

// Helper to convert Blob to Base64
const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
};

interface HighlightedWord {
    word: string;
    index: number;
}

const InteractiveText: React.FC<{
    text: string;
    onWordClick?: (word: string) => void;
    highlightedWords?: HighlightedWord[];
    lang: 'source' | 'target';
    translatingWord?: string | null;
}> = ({ text, onWordClick, highlightedWords = [], lang, translatingWord }) => {
    
    const isClickable = lang === 'source' && !!onWordClick;

    const createWordSpans = (textBlock: string) => {
        const segments = textBlock.split(/(\b[\w'-]+\b)/g);
        return segments.map((segment, index) => {
            const isWord = /\b[\w'-]+\b/.test(segment);
            if (isWord && isClickable) {
                const isTranslating = segment.toLowerCase() === translatingWord;
                return (
                    <span
                        key={index}
                        onClick={() => onWordClick!(segment)}
                        className={`cursor-pointer transition-colors hover:text-yellow-300 rounded -m-0.5 p-0.5 ${isTranslating ? 'animate-pulse text-purple-400' : ''}`}
                    >
                        {segment}
                    </span>
                );
            }
            return segment;
        });
    };

    if (highlightedWords.length === 0) {
        return (
            <p className={`text-lg leading-relaxed whitespace-pre-wrap ${lang === 'target' ? 'text-gray-400' : 'text-gray-300'}`}>
                {createWordSpans(text)}
            </p>
        );
    }

    const escapedWords = highlightedWords.map(w => w.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const regex = new RegExp(`(${escapedWords.join('|')})`, 'gi');
    const parts = text.split(regex);

    return (
        <p className={`text-lg leading-relaxed whitespace-pre-wrap ${lang === 'target' ? 'text-gray-400' : 'text-gray-300'}`}>
            {parts.map((part, index) => {
                const isMatch = index % 2 === 1;
                const originalCaseWordInfo = isMatch ? highlightedWords.find(w => w.word.toLowerCase() === part.toLowerCase()) : null;

                if (isMatch && originalCaseWordInfo) {
                    return (
                        <span
                            key={index}
                            onClick={() => isClickable && onWordClick!(originalCaseWordInfo.word)}
                            className={`rounded -m-0.5 p-0.5 font-extrabold text-yellow-300 bg-yellow-900/50 transition-colors ${isClickable ? 'cursor-pointer hover:text-yellow-300' : ''}`}
                        >
                            {part}
                            <sup className="ml-0.5 text-xs font-bold text-yellow-300 opacity-80 -top-1 relative">{originalCaseWordInfo.index}</sup>
                        </span>
                    );
                }
                return createWordSpans(part);
            })}
        </p>
    );
};

const langToCode = (langName: string): string => {
    const lowerCaseLang = langName.toLowerCase().trim();
    const map: { [key: string]: string } = {
        'english': 'en-US',
        'vietnamese': 'vi-VN',
        'spanish': 'es-ES',
        'french': 'fr-FR',
        'german': 'de-DE',
        'japanese': 'ja-JP',
        'chinese': 'zh-CN',
        'korean': 'ko-KR',
        'russian': 'ru-RU',
        'italian': 'it-IT',
        'portuguese': 'pt-BR',
    };
    return map[lowerCaseLang] || 'en-US';
};

interface ToastMessage {
    id: number;
    message: string;
    type: 'error' | 'success';
}

const App: React.FC = () => {
    const [appScreen, setAppScreen] = useState<AppScreen>(AppScreen.SETUP);
    const [userSettings, setUserSettings] = useState<UserSettings | null>(null);
    const [history, setHistory] = useState<GameState[]>([]);
    const [characterProfiles, setCharacterProfiles] = useState<CharacterProfile[]>([]);
    const [relationships, setRelationships] = useState<RelationshipEdge[]>([]);
    const [equipment, setEquipment] = useState<EquipmentItem[]>([]);
    const [skills, setSkills] = useState<SkillItem[]>([]);
    const [worldMeta, setWorldMeta] = useState<WorldMeta>({ longTermSummary: '', keyEvents: [], keyCharacters: [], rulesAndSystems: [], charactersAndRoles: [], plotAndConflict: [] });
    const [currentStepIndex, setCurrentStepIndex] = useState<number>(-1);
    const [loadingState, setLoadingState] = useState<LoadingState>(LoadingState.IDLE);
    const [error, setError] = useState<string | null>(null);
    const [notebook, setNotebook] = useState<SavedVocabularyItem[]>([]);
    const [hasSaveData, setHasSaveData] = useState<boolean>(false);
    const [isRecovering, setIsRecovering] = useState(false);
    const [saveDataInfo, setSaveDataInfo] = useState<{size: string, steps: number} | null>(null);
    const [isImageFullscreen, setIsImageFullscreen] = useState(false);
    const [currentImageUrl, setCurrentImageUrl] = useState<string>('');
    const [showStorageWarning, setShowStorageWarning] = useState(false);
    const [hasWarnedStorage, setHasWarnedStorage] = useState(false);
    const [selectedInteractiveWords, setSelectedInteractiveWords] = useState<VocabularyItem[]>([]);
    const [translatingWord, setTranslatingWord] = useState<string | null>(null);
    const [speakingState, setSpeakingState] = useState<{ type: 'story' | 'word'; key: string } | null>(null);
    const [toasts, setToasts] = useState<ToastMessage[]>([]);

    // Limits
    const MAX_EQUIPPED = 5;
    const MAX_SKILL_EQUIPPED = 5;
    const MAX_INVENTORY = 30;
    const MAX_SKILLS = 15;
    const MAX_APPLY_CHANGE_PER_STEP = 2;

    // API key initialization now happens at startup (index.tsx)


    const gameState = history[currentStepIndex] ?? null;

    const notebookWordsSet = useMemo(() => new Set(notebook.map(i => i.word.toLowerCase())), [notebook]);

    const unsavedSelectedWords = useMemo(() => {
        return selectedInteractiveWords.filter(item => !notebookWordsSet.has(item.word.toLowerCase()));
    }, [selectedInteractiveWords, notebookWordsSet]);

    // Check for saved game and load notebook on initial mount
    useEffect(() => {
        const checkDb = async () => {
            try {
                const session = await db.session.get(SESSION_ID);
                if (session) {
                    setHasSaveData(true);
                }
                const savedNotebook = await db.notebook.toArray();
                setNotebook(savedNotebook.sort((a,b) => new Date(b.dateAdded).getTime() - new Date(a.dateAdded).getTime()));
            } catch (e) {
                console.error("Failed to load data from IndexedDB", e);
                setError("Could not access local database. Your browser might be in private mode or has storage disabled.");
            }
        };
        checkDb();
    }, []);

    // Effect to manage image object URLs for the currently viewed step
    useEffect(() => {
        const currentStep = history[currentStepIndex];
        let objectUrl: string | undefined;

        // Deselect words and stop speech when navigating
        setSelectedInteractiveWords([]);
        stop();
        setSpeakingState(null);

        const loadImage = async () => {
            if (currentStep && currentStep.imageId) {
                const imageRecord = await db.images.get(currentStep.imageId);
                if (imageRecord) {
                    objectUrl = URL.createObjectURL(imageRecord.blob);
                    setCurrentImageUrl(objectUrl);
                } else {
                    console.warn(`Image not found in DB for id: ${currentStep.imageId}`);
                    setCurrentImageUrl(''); // Image not found
                }
            } else {
                setCurrentImageUrl(''); // No image for this step
            }
        };

        loadImage();

        return () => {
            if (objectUrl) {
                URL.revokeObjectURL(objectUrl);
            }
        };
    }, [currentStepIndex, history]);

    // Handle Esc key to close fullscreen image
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setIsImageFullscreen(false);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const addToast = useCallback((message: string, type: 'error' | 'success' = 'error', duration?: number) => {
        const id = Date.now();
        setToasts(prev => [...prev, { id, message, type }]);
        const autoCloseMs = typeof duration === 'number' ? duration : (type === 'success' ? 5000 : 10000);
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, autoCloseMs);
    }, []);

    useEffect(() => {
        const handler = (key: string, changeType: 'manual' | 'auto') => {
            if (changeType === 'auto') {
                const masked = `${key.slice(0,6)}...${key.slice(-4)}`;
                addToast(`API key exhausted. Switched to ${masked}`, 'success');
            }
        };
        const unsubscribe = apiKeyService.onChange(handler);
        return () => {
            try { unsubscribe?.(); } catch {}
        };
    }, [addToast]);

    const removeToast = (id: number) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    };

    const updateSaveDataInfo = useCallback(async () => {
        if (history.length > 0) {
            try {
                const jsonBytes = JSON.stringify({ userSettings, history, currentStepIndex, characterProfiles, equipment, skills, worldMeta, relationships }).length;
                const images = await db.images.toArray();
                const imageBytes = images.reduce((sum, record) => sum + record.blob.size, 0);
                const totalBytes = jsonBytes + imageBytes;
                
                const sizeMB = (totalBytes / (1024 * 1024)).toFixed(1);
                setSaveDataInfo({ size: sizeMB, steps: history.length });
                
                const overThreshold = totalBytes > STORAGE_WARNING_THRESHOLD_BYTES;
                setShowStorageWarning(overThreshold);
                if (overThreshold && !hasWarnedStorage) {
                    setHasWarnedStorage(true);
                    addToast(`Storage is high (~${sizeMB} MB). Please Save your game to a file to avoid data loss.`, 'error', 8000);
                } else if (!overThreshold && hasWarnedStorage) {
                    setHasWarnedStorage(false);
                }

            } catch (e) {
                console.error("Error calculating save size:", e);
                addToast("Could not calculate save data size.", "error");
            }
        } else {
            setSaveDataInfo(null);
            setShowStorageWarning(false);
            setHasWarnedStorage(false);
        }
    }, [history, userSettings, currentStepIndex, characterProfiles, equipment, skills, worldMeta, addToast, hasWarnedStorage]);

    useEffect(() => {
        updateSaveDataInfo();
    }, [history, updateSaveDataInfo]);

    const normalizeSkills = useCallback((arr: SkillItem[] = []): SkillItem[] =>
        arr.map(s => ({ ...s, equipped: s.equipped ?? s.isActive ?? false })), []);

    const handleStartGame = async (settings: UserSettings) => {
        setError(null);
        setIsRecovering(false);
        setLoadingState(LoadingState.GENERATING_STORY);
        setAppScreen(AppScreen.GAME);
        // Set settings immediately so GAME screen doesn't render an error during first generation
        setUserSettings(settings);

        // Try to derive long-term world context from the provided prompt (if the user used the template)
        const deriveWorldMetaFromPrompt = (text: string): WorldMeta => {
            const meta: WorldMeta = { longTermSummary: '', keyEvents: [], keyCharacters: [], rulesAndSystems: [], charactersAndRoles: [], plotAndConflict: [] };
            try {
                const lines = text.split(/\r?\n/);
                // World: <description>
                const worldLine = lines.find(l => /^\s*World:\s*/i.test(l));
                if (worldLine) {
                    meta.longTermSummary = worldLine.replace(/^\s*World:\s*/i, '').trim();
                }
                // Collect bullets under a heading until next blank line or section
                const collectBullets = (startIndex: number): string[] => {
                    const out: string[] = [];
                    for (let i = startIndex + 1; i < lines.length; i++) {
                        const ln = lines[i];
                        if (!ln.trim()) break; // stop at blank line
                        if (/^\s*---/.test(ln)) break; // stop at section delimiter
                        if (/^\s*[A-Za-z].+:\s*$/.test(ln)) break; // next heading
                        const m = ln.match(/^\s*-\s*(.+)$/);
                        if (m) out.push(m[1].trim());
                        else break;
                    }
                    return out;
                };
                // Key Events
                const kevIdx = lines.findIndex(l => /Key\s*Events\s*:/i.test(l));
                if (kevIdx !== -1) meta.keyEvents = collectBullets(kevIdx);
                // Key Characters/Factions
                const kchIdx = lines.findIndex(l => /Key\s*Characters\s*\/\s*Factions\s*:/i.test(l) || /Key\s*Characters\s*:/i.test(l));
                if (kchIdx !== -1) meta.keyCharacters = collectBullets(kchIdx);
                // Rules and Systems
                const rsIdx = lines.findIndex(l => /Rules\s*and\s*Systems\s*:/i.test(l));
                if (rsIdx !== -1) meta.rulesAndSystems = collectBullets(rsIdx);
                // Characters and Roles
                const crIdx = lines.findIndex(l => /Characters\s*and\s*Roles\s*:/i.test(l));
                if (crIdx !== -1) meta.charactersAndRoles = collectBullets(crIdx);
                // Plot and Conflict
                const pcIdx = lines.findIndex(l => /Plot\s*and\s*Conflict\s*:/i.test(l));
                if (pcIdx !== -1) meta.plotAndConflict = collectBullets(pcIdx);

                // Keep longTermSummary narrative-only; structured lists are passed separately
            } catch (_) { /* ignore parsing errors */ }
            return meta;
        };
        const seeded = deriveWorldMetaFromPrompt(settings.prompt);
        if (seeded.longTermSummary || (seeded.keyEvents?.length ?? 0) > 0 || (seeded.keyCharacters?.length ?? 0) > 0) {
            setWorldMeta(seeded);
        } else {
            setWorldMeta({ longTermSummary: '', keyEvents: [], keyCharacters: [], rulesAndSystems: [], charactersAndRoles: [], plotAndConflict: [] });
        }
        
        try {
            await db.transaction('rw', db.session, db.history, db.images, async () => {
                await db.session.clear();
                await db.history.clear();
                await db.images.clear();
            });

            const initialStep = await generateAdventureStep(`New Game: ${settings.prompt}`, settings, [], worldMeta, relationships);

            let imageUrl = '';
            let imageId: string | undefined = undefined;
            if (settings.generateImages) {
                setLoadingState(LoadingState.GENERATING_IMAGE);
                const blob = await generateAdventureImage(initialStep.imagePrompt, settings.imageModel);
                imageId = crypto.randomUUID();
                await db.images.put({ id: imageId, blob });
            }

            const { imagePrompt, characters, equipment: initEquip, skills: initSkills, summary, characterStatus, ...rest } = initialStep as any;
            const newGameState: GameState = { ...rest, imageUrl, imageId, summary, characterStatus, applyChangeActionsUsed: 0 };

            setHistory([newGameState]);
            // Initialize longTermSummary with first step summary
            try {
                const cumulative = [newGameState].map(h => h.summary).join(' ').replace(/The Player is/gi, 'You are');
                setWorldMeta(prev => ({ ...prev, longTermSummary: cumulative }));
            } catch {}
            setCurrentStepIndex(0);
            setCharacterProfiles(characters || []);
            setEquipment((initEquip || []).map(e => ({ ...e, quantity: e.quantity ?? 1 })));
            setSkills(normalizeSkills(initSkills || []));
            setSelectedInteractiveWords([]);
            
        } catch (e) {
            console.error("Failed to start game:", e);
            setError((e as Error).message);
            addToast((e as Error).message, 'error');
            setAppScreen(AppScreen.SETUP);
        } finally {
            setLoadingState(LoadingState.IDLE);
        }
    };

    const mergeEquipment = useCallback((prev: EquipmentItem[], incoming: EquipmentItem[] = []): EquipmentItem[] => {
        const byName = (s: string) => s.trim().toLowerCase();
        const map = new Map<string, EquipmentItem>();
        prev.forEach(e => map.set(byName(e.name), { ...e, quantity: e.quantity ?? 1 }));
        incoming.forEach(e => {
            const key = byName(e.name);
            const exists = map.get(key);
            if (exists) {
                map.set(key, {
                    ...exists,
                    description: e.description ?? exists.description,
                    equipped: typeof e.equipped === 'boolean' ? e.equipped : exists.equipped,
                    quantity: typeof e.quantity === 'number' ? e.quantity : (exists.quantity ?? 1),
                });
            } else {
                map.set(key, { ...e, quantity: e.quantity ?? 1 });
            }
        });
        return Array.from(map.values());
    }, []);

    const mergeSkills = useCallback((prev: SkillItem[], incoming: SkillItem[] = []): SkillItem[] => {
        const byName = (s: string) => s.trim().toLowerCase();
        const map = new Map<string, SkillItem>();
        prev.forEach(s => map.set(byName(s.name), { ...s, equipped: s.equipped ?? s.isActive ?? false }));
        incoming.forEach(s => {
            const key = byName(s.name);
            const exists = map.get(key);
            const nextEquipped = (s.equipped ?? s.isActive);
            if (exists) {
                map.set(key, {
                    ...exists,
                    level: typeof s.level === 'number' ? s.level : exists.level,
                    description: s.description ?? exists.description,
                    equipped: typeof nextEquipped === 'boolean' ? nextEquipped : (exists.equipped ?? false),
                });
            } else {
                map.set(key, { ...s, equipped: s.equipped ?? s.isActive ?? false });
            }
        });
        return Array.from(map.values());
    }, []);

    const handleMakeChoice = async (choiceIndex: number) => {
        if (loadingState !== LoadingState.IDLE) return;
        
        const currentGameState = history[currentStepIndex];
        if (!currentGameState) return;

        const updatedHistory = [...history];
        updatedHistory[currentStepIndex] = { ...currentGameState, selectedChoiceIndex: choiceIndex };
        setHistory(updatedHistory);
        
        setError(null);
        setLoadingState(LoadingState.GENERATING_STORY);

        try {
            const choice = currentGameState.choices[choiceIndex].choice;
            const recentSummaries = history.slice(Math.max(0, history.length - 3)).map(h => h.summary).join(' ');
            const equippedItems = equipment.filter(e => e.equipped).map(e => `${e.name} (${e.description})`).join('; ');
            const activeSkills = skills.filter(s => (s.equipped ?? s.isActive)).map(s => `${s.name} (Lv ${s.level})`).join('; ');

            let context = '';
            // Keep only non-duplicative context here; world meta will be injected by service
            if (userSettings?.genre) context += `Genre: ${userSettings.genre}\n`;
            if (recentSummaries) context += `Previous events: ${recentSummaries}\n`;
            if (equippedItems) context += `Equipped: ${equippedItems}\n`;
            if (activeSkills) context += `Active skills: ${activeSkills}\n`;

            const fullPrompt = `${context}The player chose: "${choice}". Continue the story. Update summary, equipment, and skills as needed.`;

            const nextStep = await generateAdventureStep(fullPrompt, userSettings!, characterProfiles, worldMeta, relationships);

            let imageUrl = '';
            let imageId: string | undefined = undefined;
            if (userSettings?.generateImages) {
                setLoadingState(LoadingState.GENERATING_IMAGE);
                const blob = await generateAdventureImage(nextStep.imagePrompt, userSettings.imageModel);
                imageId = crypto.randomUUID();
                await db.images.put({ id: imageId, blob });
            }

            const { imagePrompt: nextImagePrompt, characters: stepChars, equipment: stepEquip, skills: stepSkills, summary: stepSummary, characterStatus, ...restStep } = nextStep as any;
            const newGameState: GameState = { ...restStep, imageUrl, imageId, summary: stepSummary, characterStatus, applyChangeActionsUsed: 0 };

            const newCharacterProfiles = [...characterProfiles];
            if (stepChars && stepChars.length > 0) {
                stepChars.forEach(newChar => {
                    const existingIndex = newCharacterProfiles.findIndex(c => c.name.toLowerCase() === newChar.name.toLowerCase());
                    if (existingIndex > -1) newCharacterProfiles[existingIndex] = newChar;
                    else newCharacterProfiles.push(newChar);
                });
            }

            setEquipment(prev => mergeEquipment(prev, stepEquip || []));
            setSkills(prev => mergeSkills(prev, stepSkills || []));

            const newHistory = [...updatedHistory, newGameState];
            setHistory(newHistory);
            // Update longTermSummary to be cumulative story progress
            try {
                const cumulative = newHistory.map(h => h.summary).join(' ').replace(/The Player is/gi, 'You are');
                setWorldMeta(prev => ({ ...prev, longTermSummary: cumulative }));
            } catch {}
            setCurrentStepIndex(newHistory.length - 1);
            setCharacterProfiles(newCharacterProfiles);
            setSelectedInteractiveWords([]);
            setLoadingState(LoadingState.IDLE);

        } catch (e) {
             console.error("Failed to generate next step:", e);
             setError((e as Error).message);
             addToast((e as Error).message, 'error');
             setLoadingState(LoadingState.ERROR);
        }
    };

    const handleApplyAndChangeAction = async (equipList: EquipmentItem[], skillList: SkillItem[]) => {
        const currentGameState = history[currentStepIndex];
        if (!currentGameState || !userSettings) return;

        const used = currentGameState.applyChangeActionsUsed ?? 0;
        if (used >= MAX_APPLY_CHANGE_PER_STEP) {
            addToast(`You can only Apply & Change action ${MAX_APPLY_CHANGE_PER_STEP} times per step.`, 'error');
            return;
        }

        // Apply the staged changes first
        setEquipment(equipList.map(e => ({ ...e, quantity: e.quantity ?? 1 })));
        setSkills(normalizeSkills(skillList));

        // Build context to request new choices only
        const recentSummaries = history.slice(Math.max(0, history.length - 3)).map(h => h.summary).join(' ');
        const equippedItems = equipList.filter(e => e.equipped).map(e => `${e.name} (${e.description})`).join('; ');
        const equippedSkills = skillList.filter(s => (s.equipped ?? s.isActive)).map(s => `${s.name} (Lv ${s.level})`).join('; ');

        let context = '';
        // Always include genre and recent summaries; world meta will be injected by service
        if (userSettings?.genre) context += `Genre: ${userSettings.genre}\n`;
        if (recentSummaries) context += `Previous events: ${recentSummaries}\n`;
        if (equippedItems) context += `Equipped: ${equippedItems}\n`;
        if (equippedSkills) context += `Equipped skills: ${equippedSkills}\n`;

        const prompt = `${context}Do not continue the narrative. Based on the current situation and the equipped gear/skills, propose exactly 4 fresh, diverse, actionable choices suitable for the next move, each in both source and target languages. Keep tone and world consistent.`;

        try {
            setLoadingState(LoadingState.GENERATING_STORY);
            const step = await generateAdventureStep(prompt, userSettings, characterProfiles, worldMeta, relationships);
            const newChoices = step.choices;

            const updatedHistory = [...history];
            updatedHistory[currentStepIndex] = {
                ...currentGameState,
                choices: newChoices,
                applyChangeActionsUsed: used + 1,
            };
            setHistory(updatedHistory);
            addToast('Choices updated from current equipment/skills.', 'success');
        } catch (e) {
            console.error('Failed to refresh choices:', e);
            addToast((e as Error).message, 'error');
        } finally {
            setLoadingState(LoadingState.IDLE);
        }
    };

    const autoSaveGame = useCallback(async () => {
        if (appScreen !== AppScreen.GAME || history.length === 0 || !userSettings) return;
        try {
            await db.transaction('rw', db.session, db.history, async () => {
                await db.history.clear();
                const historyToSave: HistoryStep[] = history.map(h => ({
                    story: h.story,
                    translatedStory: h.translatedStory,
                    choices: h.choices,
                    vocabulary: h.vocabulary,
                    imageId: h.imageId || '',
                    selectedChoiceIndex: h.selectedChoiceIndex,
                    summary: h.summary,
                }));
                await db.history.bulkAdd(historyToSave);

            const sessionData: SessionData = { id: SESSION_ID, userSettings, currentStepIndex, characterProfiles, equipment, skills, worldMeta, relationships };
                await db.session.put(sessionData);
            });
            setHasSaveData(true);
        } catch (e) {
            console.error("Auto-save failed:", e);
            addToast("Auto-save failed. Your progress may not be saved.", "error");
        }
    }, [appScreen, history, userSettings, currentStepIndex, characterProfiles, equipment, skills, worldMeta, addToast]);

    useEffect(() => {
        const timer = setTimeout(() => { autoSaveGame(); }, 2000);
        return () => clearTimeout(timer);
    }, [history, autoSaveGame]);

    const handleContinueGame = async () => {
        setError(null);
        setIsRecovering(true);
        try {
            const session = await db.session.get(SESSION_ID);
            const historySteps = await db.history.orderBy('id').toArray();
            if (!session || historySteps.length === 0) throw new Error("No saved game data found.");

            const recoveredHistory: GameState[] = historySteps.map(step => ({
                story: step.story,
                translatedStory: step.translatedStory,
                imageUrl: '',
                imageId: step.imageId,
                choices: step.choices,
                vocabulary: step.vocabulary,
                selectedChoiceIndex: step.selectedChoiceIndex,
                summary: step.summary,
            }));

            setUserSettings(session.userSettings);
            setHistory(recoveredHistory);
            setCurrentStepIndex(session.currentStepIndex);
            setCharacterProfiles(session.characterProfiles);
            setRelationships(session.relationships ?? []);
            setEquipment((session.equipment || []).map(e => ({ ...e, quantity: e.quantity ?? 1 })));
            setSkills(normalizeSkills(session.skills || []));
            setWorldMeta(session.worldMeta ? ({
                ...session.worldMeta,
                // Back-compat: map futureCharacters -> keyCharacters if needed
                keyCharacters: (session.worldMeta as any).keyCharacters ?? (session.worldMeta as any).futureCharacters ?? [],
            } as WorldMeta) : { longTermSummary: '', keyEvents: [], keyCharacters: [], rulesAndSystems: [], charactersAndRoles: [], plotAndConflict: [] });
            setAppScreen(AppScreen.GAME);
        } catch (e) {
            console.error("Failed to continue game:", e);
            setError((e as Error).message);
            addToast((e as Error).message, 'error');
            setAppScreen(AppScreen.SETUP);
        } finally {
            setIsRecovering(false);
        }
    };

    const handleLoadGameFromFile = async (file: File) => {
        setError(null);
        setIsRecovering(true);
        try {
            const text = await file.text();
            const data = JSON.parse(text) as SaveData;
            if (!data.userSettings || !data.history || typeof data.currentStepIndex === 'undefined') throw new Error("Invalid save file format.");

            await clearAllData();

            const newImageRecords: ImageRecord[] = [];
            const newHistory: GameState[] = [];

            for (const step of data.history) {
                let newImageId: string | undefined = undefined;
                if (step.imageUrl && data.userSettings.generateImages) {
                    const blob = base64ToBlob(step.imageUrl, 'image/jpeg');
                    newImageId = crypto.randomUUID();
                    newImageRecords.push({ id: newImageId, blob });
                }
                newHistory.push({ ...step, imageId: newImageId, imageUrl: '' });
            }

            await db.images.bulkAdd(newImageRecords);

            setUserSettings(data.userSettings);
            setHistory(newHistory);
            setCurrentStepIndex(data.currentStepIndex);
            setCharacterProfiles(data.characterProfiles || []);
            setEquipment(data.equipment || []);
            setSkills(data.skills || []);
            setWorldMeta(data.worldMeta ? ({
                ...data.worldMeta,
                keyCharacters: (data.worldMeta as any).keyCharacters ?? (data.worldMeta as any).futureCharacters ?? [],
            } as WorldMeta) : { longTermSummary: '', keyEvents: [], keyCharacters: [], rulesAndSystems: [], charactersAndRoles: [], plotAndConflict: [] });
            setRelationships(data.relationships ?? []);
            setAppScreen(AppScreen.GAME);
            
            await autoSaveGame(); 
            addToast("Game loaded successfully!", "success");
        } catch (e) {
            console.error("Failed to load game from file:", e);
            const errorMsg = `Failed to load game: ${(e as Error).message}`;
            setError(errorMsg);
            addToast(errorMsg, 'error');
        } finally {
            setIsRecovering(false);
        }
    };

    const handleManualSave = async () => {
        if (history.length === 0 || !userSettings) return;
        try {
            const historyWithImages: GameState[] = await Promise.all(
                history.map(async (step) => {
                    if (step.imageId && userSettings.generateImages) {
                        const imageRecord = await db.images.get(step.imageId);
                        if (imageRecord) return { ...step, imageUrl: await blobToBase64(imageRecord.blob) };
                    }
                    return { ...step, imageUrl: '' };
                })
            );

            const saveData: SaveData = { userSettings, history: historyWithImages, currentStepIndex, characterProfiles, equipment, skills, worldMeta, relationships };
            const jsonString = JSON.stringify(saveData);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            const genreSlug = userSettings.genre.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
            a.download = `gemini-linguaquest-save-${genreSlug}-${Date.now()}.json`;
            a.href = url;
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
            URL.revokeObjectURL(url);
            addToast("Game saved to file!", "success");
        } catch (e) {
            console.error("Manual save failed:", e);
            addToast(`Failed to save game: ${(e as Error).message}`, "error");
        }
    };

    const handleClearData = async () => {
        if (window.confirm("Are you sure you want to clear all game data? This cannot be undone.")) {
            try {
                await clearAllData();
                setHistory([]); setCurrentStepIndex(-1); setUserSettings(null);
                setCharacterProfiles([]); setEquipment([]); setSkills([]);
                setHasSaveData(false); setError(null);
                setAppScreen(AppScreen.SETUP);
                addToast("All data cleared successfully.", "success");
            } catch (e) {
                console.error("Failed to clear data:", e);
                addToast(`Failed to clear data: ${(e as Error).message}`, 'error');
            }
        }
    };

    const handleAddToNotebook = async (item: VocabularyItem) => {
        if (notebookWordsSet.has(item.word.toLowerCase())) {
            addToast(`"${item.word}" is already in your notebook.`, "error");
            return;
        }
        const newItem: SavedVocabularyItem = {
            ...item, id: crypto.randomUUID(), dateAdded: new Date().toISOString(),
            correctCount: 0, incorrectCount: 0,
        };
        try {
            await db.notebook.add(newItem);
            setNotebook(prev => [newItem, ...prev]);
        } catch (e) {
            console.error("Failed to add to notebook:", e);
            addToast("Failed to save word to notebook.", "error");
        }
    };

    const handleDeleteFromNotebook = async (id: string) => {
        try {
            await db.notebook.delete(id);
            setNotebook(prev => prev.filter(item => item.id !== id));
        } catch (e) {
             console.error("Failed to delete from notebook:", e);
             addToast("Failed to delete word from notebook.", "error");
        }
    };

    const handleUpdateNotebook = async (updatedNotebook: SavedVocabularyItem[]) => {
        try {
            await db.notebook.bulkPut(updatedNotebook);
            setNotebook(updatedNotebook.sort((a,b) => new Date(b.dateAdded).getTime() - new Date(a.dateAdded).getTime()));
        } catch (e) {
            console.error("Failed to update notebook:", e);
            addToast("Failed to update notebook progress.", "error");
        }
    };

    const handleWordClick = async (word: string) => {
        const lowerCaseWord = word.toLowerCase();
        const existingIndex = selectedInteractiveWords.findIndex(item => item.word.toLowerCase() === lowerCaseWord);
        if (existingIndex !== -1) {
            setSelectedInteractiveWords(prev => prev.filter(item => item.word.toLowerCase() !== lowerCaseWord));
            return;
        }
        if (!userSettings || !gameState) return;
        setTranslatingWord(lowerCaseWord);
        try {
            const translation = await translateWord(word, userSettings.sourceLanguage, userSettings.targetLanguage, gameState.story, gameState.translatedStory);
            setSelectedInteractiveWords(prev => [...prev, { word, translation }]);
        } catch (e) {
            addToast((e as Error).message, 'error');
        } finally {
            setTranslatingWord(null);
        }
    };

    const handleSaveSelectedWords = async () => {
        const wordsToSave = unsavedSelectedWords;
        if (wordsToSave.length === 0) return;
        const newItems: SavedVocabularyItem[] = wordsToSave.map(item => ({
            ...item, id: crypto.randomUUID(), dateAdded: new Date().toISOString(),
            correctCount: 0, incorrectCount: 0,
        }));
        try {
            await db.notebook.bulkAdd(newItems);
            setNotebook(prev => [...newItems, ...prev].sort((a,b) => new Date(b.dateAdded).getTime() - new Date(a.dateAdded).getTime()));
            addToast(`${newItems.length} word(s) saved to notebook!`, "success");
        } catch (e) {
             console.error("Failed to bulk add to notebook:", e);
             addToast("Failed to save selected words.", "error");
        }
    };

    const handleSpeak = (text: string, lang: 'source' | 'target' | 'source_word', key: string) => {
        stop();
        if (speakingState?.key === key) {
            setSpeakingState(null);
            return;
        }
        const langName = lang === 'target' ? userSettings?.targetLanguage : userSettings?.sourceLanguage;
        if (!langName) return;
        const langCode = langToCode(langName);
        const type = lang === 'source_word' ? 'word' : 'story';
        setSpeakingState({ type, key });
        speak(text, langCode, () => setSpeakingState(null), () => {
            setSpeakingState(null);
            addToast(`Could not play audio for ${langName}.`, "error");
        });
    };

    const handleToggleImageGeneration = (e: React.ChangeEvent<HTMLInputElement>) => {
        const isEnabled = e.target.checked;
        if (userSettings) {
            setUserSettings({ ...userSettings, generateImages: isEnabled });
            addToast(`Image generation ${isEnabled ? 'enabled' : 'disabled'}.`, 'success', 3000);
        }
    };

    const highlightedWordsForText = useMemo<HighlightedWord[]>(() => selectedInteractiveWords.map((item, i) => ({ word: item.word, index: i + 1 })), [selectedInteractiveWords]);
    const highlightedTranslationsForText = useMemo<HighlightedWord[]>(() => selectedInteractiveWords.map((item, i) => ({ word: item.translation, index: i + 1 })), [selectedInteractiveWords]);

    const isLoading = loadingState === LoadingState.GENERATING_STORY || loadingState === LoadingState.GENERATING_IMAGE || isRecovering;

    const renderScreen = () => {
        switch (appScreen) {
            case AppScreen.NOTEBOOK:
                return <NotebookView notebook={notebook} onUpdateNotebook={handleUpdateNotebook} onClose={() => setAppScreen(AppScreen.GAME)} onDelete={handleDeleteFromNotebook} />;
            case AppScreen.API_KEY_MANAGER:
                return <ApiKeyManager onBack={() => setAppScreen(AppScreen.SETUP)} onToast={addToast} />;
            case AppScreen.PROFILE:
                return (
                    <CharacterProfileView 
                        equipment={equipment}
                        skills={skills}
                        status={history[currentStepIndex]?.characterStatus}
                        limits={{
                            maxEquipped: MAX_EQUIPPED,
                            maxEquippedSkills: MAX_SKILL_EQUIPPED,
                            maxInventory: MAX_INVENTORY,
                            maxSkills: MAX_SKILLS,
                            maxApplyChangePerStep: MAX_APPLY_CHANGE_PER_STEP,
                        }}
                        applyChangeRemaining={(history[currentStepIndex]?.applyChangeActionsUsed ?? 0) >= MAX_APPLY_CHANGE_PER_STEP ? 0 : (MAX_APPLY_CHANGE_PER_STEP - (history[currentStepIndex]?.applyChangeActionsUsed ?? 0))}
                        worldMeta={worldMeta}
                        progressSummary={history.length > 0 ? history.map(h => h.summary).join(' ').replace(/The Player is/gi, 'You are') : ''}
                        tags={userSettings?.tags}
                        characters={characterProfiles}
                        relationships={relationships}
                        onUpdateRelationships={(rels) => setRelationships(rels)}
                        onApply={(equip, skillList) => {
                            if (equip.length > MAX_INVENTORY) {
                                addToast(`Inventory exceeds ${MAX_INVENTORY} items.`, 'error');
                                return;
                            }
                            if (skillList.length > MAX_SKILLS) {
                                addToast(`Skills exceed ${MAX_SKILLS}.`, 'error');
                                return;
                            }
                            setEquipment(equip.map(e => ({ ...e, quantity: e.quantity ?? 1 })));
                            setSkills(normalizeSkills(skillList));
                            addToast('Changes applied.', 'success');
                            setAppScreen(AppScreen.GAME); // auto back to game on Apply
                        }}
                        onApplyAndChange={(equip, skillList) => {
                            handleApplyAndChangeAction(equip, skillList);
                            setAppScreen(AppScreen.GAME); // auto back to game
                        }}
                        onClose={() => setAppScreen(AppScreen.GAME)}
                    />
                );
            case AppScreen.GAME:
                if (!gameState || !userSettings) {
                    // During initial generation or recovery, show a loading screen instead of error
                    if (isLoading) {
                        return (
                            <div className="flex h-screen items-center justify-center flex-col gap-3">
                                <LoadingSpinner />
                                <p className="text-gray-400">Preparing your adventure...</p>
                            </div>
                        );
                    }
                    return (
                        <div className="flex h-screen items-center justify-center">
                            <p>Error: Game state is missing. <button onClick={() => setAppScreen(AppScreen.SETUP)} className="underline">Go to Setup</button></p>
                        </div>
                    );
                }
                return (
                    <div className="min-h-screen flex flex-col md:flex-row">
                        {userSettings.generateImages && (
                            <div className={`relative w-full md:w-1/2 bg-black flex items-center justify-center group transition-all duration-500 ${isImageFullscreen ? 'fixed inset-0 z-40' : ''}`} onClick={() => currentImageUrl && setIsImageFullscreen(!isImageFullscreen)}>
                                {loadingState === LoadingState.GENERATING_IMAGE ? (
                                    <div className="text-center"><LoadingSpinner /><p className="mt-4 text-gray-400">Conjuring visuals...</p></div>
                                ) : currentImageUrl ? (
                                    <>
                                        <img src={currentImageUrl} alt="Adventure scene" className={`object-contain w-full h-full transition-opacity duration-500 ${isImageFullscreen ? 'cursor-zoom-out' : 'cursor-zoom-in'}`} />
                                        <div className="absolute bottom-2 right-2 bg-black/50 p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 1v4m0 0h-4m4 0l-5-5" /></svg>
                                        </div>
                                    </>
                                ) : null}
                            </div>
                        )}
                        <main className={`w-full ${userSettings.generateImages ? 'md:w-1/2' : 'md:w-full'} p-4 md:p-8 flex flex-col overflow-y-auto`} style={{maxHeight: '100vh'}}>
                            <header className="flex justify-between items-center mb-4 border-b border-gray-700 pb-4 flex-wrap gap-y-2">
                                <h1 className="text-2xl font-bold text-purple-300">{userSettings.genre}</h1>
                                <div className="flex gap-2 items-center flex-wrap">
                                    {saveDataInfo && (
                                        <div
                                            className={`text-xs px-2 py-1 rounded border ${showStorageWarning ? 'bg-yellow-900/50 text-yellow-300 border-yellow-700/80' : 'bg-gray-800/60 text-gray-300 border-gray-700/80'}`}
                                            title={`Approximate local storage used${showStorageWarning ? ' (over recommended limit)' : ''}`}
                                        >
                                            Storage: {saveDataInfo.size} MB
                                        </div>
                                    )}
                                    <div className="flex items-center gap-2 text-sm mr-4">
                                        <input
                                            type="checkbox"
                                            id="inGameImageToggle"
                                            checked={userSettings.generateImages}
                                            onChange={handleToggleImageGeneration}
                                            className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500 bg-gray-800"
                                        />
                                        <label htmlFor="inGameImageToggle" className="text-gray-300">Generate Images</label>
                                    </div>
                                    <button onClick={() => setAppScreen(AppScreen.PROFILE)} className="bg-gray-700 hover:bg-gray-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors">Profile</button>
                                    <button onClick={() => setAppScreen(AppScreen.NOTEBOOK)} className="bg-gray-700 hover:bg-gray-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors">Notebook ({notebook.length})</button>
                                    <button onClick={handleManualSave} className="bg-gray-700 hover:bg-gray-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors">Save</button>
                                    <button onClick={() => setAppScreen(AppScreen.SETUP)} className="bg-gray-700 hover:bg-gray-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors">Menu</button>
                                </div>
                            </header>
                            <div className="flex justify-between items-center mb-4 text-sm">
                                <button onClick={() => setCurrentStepIndex(i => i - 1)} disabled={currentStepIndex <= 0 || loadingState !== LoadingState.IDLE} className="py-2 px-5 rounded-lg bg-gray-700/50 hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">{"< Previous"}</button>
                                <span>Step {currentStepIndex + 1} / {history.length}</span>
                                <button onClick={() => setCurrentStepIndex(i => i + 1)} disabled={currentStepIndex >= history.length - 1 || loadingState !== LoadingState.IDLE} className="py-2 px-5 rounded-lg bg-gray-700/50 hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">{"Next >"}</button>
                            </div>
                            {loadingState === LoadingState.GENERATING_STORY ? (
                                <div className="flex-grow flex flex-col justify-center items-center"><LoadingSpinner /><p className="mt-4 text-gray-400">The story unfolds...</p></div>
                            ) : (
                                <div className="space-y-6 flex-grow">
                                    <div className="space-y-4 p-4 bg-gray-800/40 rounded-lg">
                                        <div className="flex justify-between items-center">
                                            <h2 className="text-xl font-bold">{userSettings.sourceLanguage}</h2>
                                            <button onClick={() => handleSpeak(gameState.story, 'source', `story-source-${currentStepIndex}`)} className="p-1 rounded-full hover:bg-gray-700 transition-colors" title={`Speak ${userSettings.sourceLanguage}`}>{speakingState?.key === `story-source-${currentStepIndex}` ? '...' : '🔊'}</button>
                                        </div>
                                        <InteractiveText text={gameState.story} onWordClick={handleWordClick} highlightedWords={highlightedWordsForText} lang="source" translatingWord={translatingWord}/>
                                        <hr className="border-gray-700"/>
                                        <div className="flex justify-between items-center">
                                            <h2 className="text-xl font-bold">{userSettings.targetLanguage}</h2>
                                             <button onClick={() => handleSpeak(gameState.translatedStory, 'target', `story-target-${currentStepIndex}`)} className="p-1 rounded-full hover:bg-gray-700 transition-colors" title={`Speak ${userSettings.targetLanguage}`}>{speakingState?.key === `story-target-${currentStepIndex}` ? '...' : '🔊'}</button>
                                        </div>
                                        <InteractiveText text={gameState.translatedStory} highlightedWords={highlightedTranslationsForText} lang="target"/>
                                    </div>
                                    <div className="p-4 bg-gray-800/40 rounded-lg">
                                        <h3 className="text-lg font-bold mb-3">Vocabulary</h3>
                                        <ul className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2">
                                            {gameState.vocabulary.map((item, index) => {
                                                const isSaved = notebookWordsSet.has(item.word.toLowerCase());
                                                return (
                                                    <li key={index} className="flex justify-between items-start gap-2">
                                                        <div className="flex items-start gap-2 min-w-0 mr-2">
                                                            <button onClick={() => handleSpeak(item.word, 'source_word', `vocab-${currentStepIndex}-${index}`)} title={`Speak ${userSettings.sourceLanguage}`} className="text-gray-400 hover:text-white flex-shrink-0 mt-1">{speakingState?.key === `vocab-${currentStepIndex}-${index}` ? '...' : '🔊'}</button>
                                                            <span><span className="font-semibold">{item.word}</span>: <span className="text-gray-400">{item.translation}</span></span>
                                                        </div>
                                                        <button 
                                                            onClick={() => handleAddToNotebook(item)} 
                                                            disabled={isSaved} 
                                                            className="p-1.5 rounded-full transition-colors disabled:cursor-not-allowed disabled:bg-gray-700 disabled:opacity-60 bg-purple-600 hover:bg-purple-700 text-white flex-shrink-0"
                                                            title={isSaved ? "In notebook" : "Add to notebook"}
                                                        >
                                                            {isSaved ? (
                                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                                                    <path d="M5 4a2 2 0 012-2h6a2 2 0 012 2v14l-5-2.5L5 18V4z" />
                                                                </svg>
                                                            ) : (
                                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                                                                </svg>
                                                            )}
                                                        </button>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    </div>
                                    {selectedInteractiveWords.length > 0 && (
                                         <div className="p-4 bg-gray-800/40 rounded-lg animate-fade-in">
                                            <div className="flex justify-between items-center mb-3">
                                                <h3 className="text-lg font-bold">Selected Words</h3>
                                                {unsavedSelectedWords.length > 0 && <button onClick={handleSaveSelectedWords} className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-1 px-3 rounded-md text-sm">Save All ({unsavedSelectedWords.length})</button>}
                                            </div>
                                            <ul className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2">
                                                {selectedInteractiveWords.map((item, index) => {
                                                    const isSaved = notebookWordsSet.has(item.word.toLowerCase());
                                                    return (
                                                        <li key={index} className="flex justify-between items-start gap-2">
                                                            <div className="flex items-start gap-2 min-w-0 mr-2">
                                                                <button onClick={() => handleSpeak(item.word, 'source_word', `selected-${currentStepIndex}-${index}`)} title={`Speak ${userSettings.sourceLanguage}`} className="text-gray-400 hover:text-white flex-shrink-0 mt-1">{speakingState?.key === `selected-${currentStepIndex}-${index}` ? '...' : '🔊'}</button>
                                                                <span><span className="font-semibold text-yellow-300">{item.word}</span>: <span className="text-gray-400">{item.translation}</span></span>
                                                            </div>
                                                            <button 
                                                                onClick={() => handleAddToNotebook(item)} 
                                                                disabled={isSaved} 
                                                                className="p-1.5 rounded-full transition-colors disabled:cursor-not-allowed disabled:bg-gray-700 disabled:opacity-60 bg-purple-600 hover:bg-purple-700 text-white flex-shrink-0"
                                                                title={isSaved ? "In notebook" : "Add to notebook"}
                                                            >
                                                                {isSaved ? (
                                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                                                        <path d="M5 4a2 2 0 012-2h6a2 2 0 012 2v14l-5-2.5L5 18V4z" />
                                                                    </svg>
                                                                ) : (
                                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                                                                    </svg>
                                                                )}
                                                            </button>
                                                        </li>
                                                    );
                                                })}
                                            </ul>
                                        </div>
                                    )}
                                    {currentStepIndex === history.length - 1 ? (
                                        <div className="space-y-3"><h3 className="text-lg font-bold">What do you do next?</h3>{gameState.choices.map((choice, index) => <ChoiceButton key={index} item={choice} onClick={() => handleMakeChoice(index)} disabled={loadingState !== LoadingState.IDLE} />)}</div>
                                    ) : (
                                        <div className="p-4 bg-gray-800/40 rounded-lg"><h3 className="text-lg font-bold mb-2">Your Choice</h3><ChoiceButton item={gameState.choices[gameState.selectedChoiceIndex!]} onClick={() => {}} disabled={true} isSelected={true} /></div>
                                    )}
                                </div>
                            )}
                             {loadingState === LoadingState.ERROR && error && (
                                <div className="mt-4 p-4 bg-red-900/50 border border-red-700/80 rounded-lg text-red-300">
                                    <p className="font-bold">An Error Halted Your Adventure</p>
                                    <p className="text-sm mb-2">{error}</p>
                                    <button onClick={() => setLoadingState(LoadingState.IDLE)} className="underline text-sm">Dismiss</button>
                                </div>
                            )}
                            {showStorageWarning && (
                                <div className="mt-4 p-4 bg-yellow-900/50 border border-yellow-700/80 rounded-lg text-yellow-300 text-sm flex items-center justify-between gap-3">
                                    <span><strong>Storage Warning:</strong> Using {saveDataInfo?.size} MB. Please save your game to a file.</span>
                                    <button onClick={handleManualSave} className="bg-yellow-700 hover:bg-yellow-600 text-yellow-50 font-semibold py-1 px-3 rounded-md">Save Now</button>
                                </div>
                            )}
                        </main>
                    </div>
                );
            case AppScreen.SETUP:
            default:
                 return <GameSetup onStartGame={handleStartGame} isLoading={isLoading} onLoadGame={handleLoadGameFromFile} onContinueGame={handleContinueGame} hasSaveData={hasSaveData} error={error} onClearData={handleClearData} onToast={addToast} onManageApiKeys={() => setAppScreen(AppScreen.API_KEY_MANAGER)} />;
        }
    };

    return (
        <div className="min-h-screen bg-gray-900 text-gray-200">
            {renderScreen()}
            <div aria-live="assertive" className="pointer-events-none fixed inset-0 flex items-end px-4 py-6 sm:items-start sm:p-6 z-50">
                <div className="flex w-full flex-col items-center space-y-4 sm:items-end">
                    {toasts.map(toast => (
                        <Toast key={toast.id} message={toast.message} type={toast.type} onClose={() => removeToast(toast.id)} />
                    ))}
                </div>
            </div>
        </div>
    );
};

export default App;





