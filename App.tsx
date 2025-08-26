import React, { useState, useEffect, useCallback } from 'react';
import { LoadingState, GameState, AppScreen, UserSettings, VocabularyItem, SavedVocabularyItem, SaveData, ChoiceItem, CharacterProfile } from './types';
import { generateAdventureStep, generateAdventureImage } from './services/geminiService';
import ChoiceButton from './components/ChoiceButton';
import LoadingSpinner from './components/LoadingSpinner';
import GameSetup from './components/GameSetup';
import NotebookView from './components/NotebookView';

const NOTEBOOK_KEY = 'geminiAdventureNotebook';
const SAVE_GAME_KEY = 'geminiAdventureSave';
const SAVE_VERSION = '1.0'; // Version for compatibility checking
const MAX_HISTORY_LENGTH = 50; // Limit history to prevent localStorage overflow

// Helper function to validate save data structure
const isValidSaveData = (data: any): data is SaveData => {
    if (!data || typeof data !== 'object') return false;
    
    // Check required properties
    if (!data.userSettings || !data.history || !Array.isArray(data.history) || typeof data.currentStepIndex !== 'number') {
        return false;
    }
    
    // Validate userSettings
    const settings = data.userSettings;
    if (!settings.prompt || !settings.genre || !settings.sourceLanguage || !settings.targetLanguage) {
        return false;
    }
    
    // Validate history array
    for (const state of data.history) {
        if (!state.story || !state.translatedStory || !Array.isArray(state.choices) || !Array.isArray(state.vocabulary)) {
            return false;
        }
    }
    
    return true;
};

// Helper function to sanitize save data
const sanitizeSaveData = (data: any): SaveData | null => {
    try {
        if (!isValidSaveData(data)) return null;
        
        // Ensure all required properties exist with defaults
        const sanitized: SaveData = {
            userSettings: {
                ...data.userSettings,
                generateImages: data.userSettings.generateImages ?? true,
            },
            history: data.history.map((state: any) => ({
                story: state.story || '',
                translatedStory: state.translatedStory || '',
                imageUrl: state.imageUrl || '',
                choices: Array.isArray(state.choices) ? state.choices : [],
                vocabulary: Array.isArray(state.vocabulary) ? state.vocabulary : [],
            })),
            currentStepIndex: Math.max(0, Math.min(data.currentStepIndex, data.history.length - 1)),
            characterProfiles: Array.isArray(data.characterProfiles) ? data.characterProfiles : [],
        };
        
        return sanitized;
    } catch (error) {
        console.error('Error sanitizing save data:', error);
        return null;
    }
};

const App: React.FC = () => {
    const [appScreen, setAppScreen] = useState<AppScreen>(AppScreen.SETUP);
    const [userSettings, setUserSettings] = useState<UserSettings | null>(null);
    const [history, setHistory] = useState<GameState[]>([]);
    const [characterProfiles, setCharacterProfiles] = useState<CharacterProfile[]>([]);
    const [currentStepIndex, setCurrentStepIndex] = useState<number>(-1);
    const [loadingState, setLoadingState] = useState<LoadingState>(LoadingState.IDLE);
    const [error, setError] = useState<string | null>(null);
    const [notebook, setNotebook] = useState<SavedVocabularyItem[]>([]);
    const [hasSaveData, setHasSaveData] = useState<boolean>(false);
    const [showSaveConfirmation, setShowSaveConfirmation] = useState(false);
    const [isRecovering, setIsRecovering] = useState(false);
    const [saveDataInfo, setSaveDataInfo] = useState<{size: string, steps: number} | null>(null);
    const [isImageFullscreen, setIsImageFullscreen] = useState(false);

    const gameState = history[currentStepIndex] ?? null;

    // Safe localStorage operations with try-catch and quota management
    const safeGetItem = (key: string): string | null => {
        try {
            return localStorage.getItem(key);
        } catch (error) {
            console.error(`Error reading ${key} from localStorage:`, error);
            return null;
        }
    };

    const safeSetItem = (key: string, value: string): boolean => {
        try {
            // Check if the data would exceed reasonable limits
            if (value.length > 4.5 * 1024 * 1024) { // 4.5MB limit to leave room for other data
                console.warn(`Data for ${key} is very large (${(value.length / 1024 / 1024).toFixed(2)}MB), attempting to compress...`);
                return false;
            }
            
            localStorage.setItem(key, value);
            return true;
        } catch (error) {
            console.error(`Error writing ${key} to localStorage:`, error);
            
            // If quota exceeded, try to clean up old data
            if (error instanceof Error && error.message.includes('quota')) {
                console.warn('LocalStorage quota exceeded, attempting cleanup...');
                try {
                    // Clear any old save data that might exist
                    const keysToCheck = ['geminiAdventureSave', 'geminiAdventureNotebook'];
                    let freedSpace = false;
                    
                    keysToCheck.forEach(k => {
                        if (k !== key) {
                            const existing = localStorage.getItem(k);
                            if (existing && existing.length > 1024 * 1024) { // If over 1MB
                                localStorage.removeItem(k);
                                freedSpace = true;
                            }
                        }
                    });
                    
                    // Try again if we freed some space
                    if (freedSpace) {
                        localStorage.setItem(key, value);
                        return true;
                    }
                } catch (retryError) {
                    console.error('Failed to retry after cleanup:', retryError);
                }
            }
            return false;
        }
    };

    const safeRemoveItem = (key: string): void => {
        try {
            localStorage.removeItem(key);
        } catch (error) {
            console.error(`Error removing ${key} from localStorage:`, error);
        }
    };

    // Compress save data by removing unnecessary fields and limiting history
    const compressSaveData = (data: SaveData): SaveData => {
        const compressed = { ...data };
        
        // Limit history length to prevent localStorage overflow
        if (compressed.history.length > MAX_HISTORY_LENGTH) {
            const startIndex = Math.max(0, compressed.currentStepIndex - Math.floor(MAX_HISTORY_LENGTH / 2));
            const endIndex = Math.min(compressed.history.length, startIndex + MAX_HISTORY_LENGTH);
            
            compressed.history = compressed.history.slice(startIndex, endIndex);
            compressed.currentStepIndex = Math.min(compressed.currentStepIndex - startIndex, compressed.history.length - 1);
        }
        
        // Remove base64 image data from older history entries to save space (keep last 10)
        const keepImagesCount = 10;
        if (compressed.history.length > keepImagesCount) {
            for (let i = 0; i < compressed.history.length - keepImagesCount; i++) {
                if (compressed.history[i].imageUrl && compressed.history[i].imageUrl.startsWith('data:')) {
                    compressed.history[i].imageUrl = ''; // Remove base64 image data
                }
            }
        }
        
        return compressed;
    };

    // Load notebook and check for saved game on initial mount
    useEffect(() => {
        try {
            const savedNotebook = safeGetItem(NOTEBOOK_KEY);
            if (savedNotebook) {
                const parsedNotebook = JSON.parse(savedNotebook) as SavedVocabularyItem[];
                if (Array.isArray(parsedNotebook)) {
                    // Ensure backward compatibility with old saves
                    const sanitizedNotebook = parsedNotebook.map(item => ({
                        ...item,
                        correctCount: item.correctCount || 0,
                        incorrectCount: item.incorrectCount || 0,
                    }));
                    setNotebook(sanitizedNotebook);
                }
            }
            
            const savedGame = safeGetItem(SAVE_GAME_KEY);
            if (savedGame) {
                try {
                    const parsedSave = JSON.parse(savedGame);
                    if (isValidSaveData(parsedSave)) {
                        setHasSaveData(true);
                    } else {
                        console.warn('Invalid save data detected, removing...');
                        safeRemoveItem(SAVE_GAME_KEY);
                        setHasSaveData(false);
                    }
                } catch (parseError) {
                    console.error('Error parsing save data:', parseError);
                    safeRemoveItem(SAVE_GAME_KEY);
                    setHasSaveData(false);
                }
            }
        } catch (e) {
            console.error("Failed to load data from localStorage", e);
        }
    }, []);
    
    // Save notebook whenever it changes
    useEffect(() => {
        if (notebook.length > 0) {
            safeSetItem(NOTEBOOK_KEY, JSON.stringify(notebook));
        }
    }, [notebook]);

    // Handle Esc key to close fullscreen image
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setIsImageFullscreen(false);
            }
        };

        if (isImageFullscreen) {
            document.addEventListener('keydown', handleKeyDown);
        }

        return () => {
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isImageFullscreen]);

    const saveGameToLocalStorage = useCallback(() => {
        if (userSettings && history.length > 0) {
            const saveData: SaveData = { 
                userSettings, 
                history, 
                currentStepIndex, 
                characterProfiles 
            };
            
            // Compress the save data to reduce size
            const compressedSave = compressSaveData(saveData);
            const jsonString = JSON.stringify(compressedSave);
            
            // Show size information
            const sizeKB = (jsonString.length / 1024).toFixed(2);
            console.log(`Save data size: ${sizeKB}KB`);
            
            const success = safeSetItem(SAVE_GAME_KEY, jsonString);
            if (success) {
                setHasSaveData(true);
            } else {
                // If save failed, show warning to user
                console.warn('Failed to save game data to localStorage. The game history might be too large.');
                setError('Warning: Could not auto-save game. Your progress is safe in this session, but consider manually saving to a file.');
                setTimeout(() => setError(null), 5000);
            }
        }
    }, [userSettings, history, currentStepIndex, characterProfiles]);
    
    useEffect(() => {
        // Auto-save on state change and update save info
        if (userSettings && history.length > 0) {
            saveGameToLocalStorage();
            
            // Update save data info
            const testSave = { userSettings, history, currentStepIndex, characterProfiles };
            const jsonString = JSON.stringify(testSave);
            const sizeKB = (jsonString.length / 1024).toFixed(1);
            setSaveDataInfo({ size: sizeKB, steps: history.length });
        }
    }, [saveGameToLocalStorage, userSettings, history]);

    const handleManualSave = () => {
        if (!userSettings || history.length === 0) {
            setError("No game data to save.");
            return;
        }
        
        // First, save to local storage for the continue button (with compression)
        saveGameToLocalStorage();
        setShowSaveConfirmation(true);
        setTimeout(() => {
            setShowSaveConfirmation(false);
        }, 3000);

        // Then, trigger download with FULL uncompressed data
        try {
            const saveData: SaveData = { userSettings, history, currentStepIndex, characterProfiles };
            const jsonString = JSON.stringify(saveData, null, 2);
            const blob = new Blob([jsonString], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `gemini-linguaquest-save-${Date.now()}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error('Failed to create save file:', err);
            setError('Failed to create save file. Please try again.');
            setTimeout(() => setError(null), 5000);
        }
    };

    const handleContinueGame = useCallback(() => {
        setIsRecovering(true);
        setError(null);
        
        try {
            const savedGame = safeGetItem(SAVE_GAME_KEY);
            if (!savedGame) {
                setError("No saved game found.");
                setIsRecovering(false);
                return;
            }
            
            const parsedData = JSON.parse(savedGame);
            const sanitizedData = sanitizeSaveData(parsedData);
            
            if (!sanitizedData) {
                throw new Error("Save data is corrupted or incompatible.");
            }
            
            // Load the data
            setUserSettings(sanitizedData.userSettings);
            setHistory(sanitizedData.history);
            setCurrentStepIndex(sanitizedData.currentStepIndex);
            setCharacterProfiles(sanitizedData.characterProfiles);
            setAppScreen(AppScreen.GAME);
            setError(null);
            setLoadingState(LoadingState.IDLE);
            
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Could not load game.';
            console.error("Failed to load game from localStorage", err);
            setError(`Failed to load save file: ${message}. The save data may be corrupted.`);
            
            // Remove corrupted save
            safeRemoveItem(SAVE_GAME_KEY);
            setHasSaveData(false);
        }
        
        setIsRecovering(false);
    }, []);

    const handleLoadGameFromFile = (file: File) => {
        setIsRecovering(true);
        setError(null);
        
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const text = e.target?.result as string;
                if (!text) {
                    throw new Error("File is empty.");
                }
                
                const parsedData = JSON.parse(text);
                const sanitizedData = sanitizeSaveData(parsedData);
                
                if (!sanitizedData) {
                    throw new Error("Save file is corrupted or incompatible with current version.");
                }
                
                // Load the data
                setUserSettings(sanitizedData.userSettings);
                setHistory(sanitizedData.history);
                setCurrentStepIndex(sanitizedData.currentStepIndex);
                setCharacterProfiles(sanitizedData.characterProfiles);
                setAppScreen(AppScreen.GAME);
                setError(null);
                setLoadingState(LoadingState.IDLE);
                
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Could not load game from file.';
                console.error("Failed to load game from file", err);
                setError(`Failed to load save file: ${message}`);
            }
            
            setIsRecovering(false);
        };
        
        reader.onerror = () => {
            setError(`Failed to read file: ${reader.error?.message ?? 'Unknown error'}`);
            setIsRecovering(false);
        };
        
        reader.readAsText(file);
    };
    
    const updateCharacterProfiles = (newProfiles: CharacterProfile[]) => {
        if (!newProfiles || newProfiles.length === 0) return;
        
        setCharacterProfiles(prevProfiles => {
            const profilesMap = new Map(prevProfiles.map(p => [p.name.toLowerCase(), p]));
            newProfiles.forEach(newProfile => {
                if (newProfile.name && newProfile.description) {
                    profilesMap.set(newProfile.name.toLowerCase(), newProfile);
                }
            });
            return Array.from(profilesMap.values());
        });
    };

    const getLoadingMessage = () => {
        if (isRecovering) return "Recovering your adventure...";
        
        switch (loadingState) {
            case LoadingState.GENERATING_STORY:
                return "The dungeon master is weaving your fate...";
            case LoadingState.GENERATING_IMAGE:
                return "A magical artist is painting your scene...";
            case LoadingState.ERROR:
                return "A mysterious force has interfered...";
            default:
                return "";
        }
    };
    
    const handleStartGame = useCallback(async (settings: UserSettings) => {
        setLoadingState(LoadingState.GENERATING_STORY);
        setError(null);
        setHistory([]);
        setCurrentStepIndex(-1);
        setUserSettings(settings);
        setCharacterProfiles([]);
        setAppScreen(AppScreen.GAME);

        const adventureStep = await generateAdventureStep(settings.prompt, settings, []);

        if (adventureStep === 'RPC_ERROR') {
            setError("A connection error occurred while generating the story. This might be a temporary issue. Please try again in a moment.");
            setLoadingState(LoadingState.ERROR);
            return;
        }

        if (!adventureStep) {
            setError("Failed to generate the story. The ancient scrolls are unreadable. Please try again.");
            setLoadingState(LoadingState.ERROR);
            return;
        }
        
        updateCharacterProfiles(adventureStep.characters);

        let imageUrl: string = '';

        if (settings.generateImages) {
            setLoadingState(LoadingState.GENERATING_IMAGE);
            const imageResult = await generateAdventureImage(adventureStep.imagePrompt);
            
            if (imageResult === 'RATE_LIMITED') {
                const disableImagesPermanently = window.confirm("Image generation has reached its quota limit. Would you like to disable images for the rest of this adventure to avoid further errors?");
                if (disableImagesPermanently) {
                    setUserSettings(prev => ({ ...prev!, generateImages: false }));
                    // Proceed without an image
                } else {
                    setError("Image generation failed due to quota limits. You can return to the menu and try again later, or start a new game with images disabled.");
                    setLoadingState(LoadingState.IDLE);
                    setAppScreen(AppScreen.SETUP); 
                    return;
                }
            } else if (!imageResult) {
                setError("Failed to generate the image. The artist's vision is clouded. Please try again.");
                setLoadingState(LoadingState.ERROR);
                return;
            } else {
                imageUrl = imageResult;
            }
        }

        const newGameState: GameState = {
            story: adventureStep.story,
            translatedStory: adventureStep.translatedStory,
            imageUrl,
            choices: adventureStep.choices,
            vocabulary: adventureStep.vocabulary,
        };

        setHistory([newGameState]);
        setCurrentStepIndex(0);
        setLoadingState(LoadingState.IDLE);
    }, []);

    const handleChoice = async (choice: ChoiceItem) => {
        if (!gameState || !userSettings) return;

        setLoadingState(LoadingState.GENERATING_STORY);
        setError(null);
        
        const currentHistory = history.slice(0, currentStepIndex + 1);
        const storyContext = currentHistory.map(h => h.story).slice(-3).join('\n\n');
        const nextPrompt = `Continue the story based on the player's last choice. The story's source language is ${userSettings.sourceLanguage} and the target language for translation is ${userSettings.targetLanguage}.\n\nPREVIOUS STORY:\n${storyContext}\n\nPLAYER'S CHOICE: "${choice.choice}"`;

        const adventureStep = await generateAdventureStep(nextPrompt, userSettings, characterProfiles);

        if (adventureStep === 'RPC_ERROR') {
            setError("A connection error occurred while generating the next chapter. This might be a temporary issue. Please try another choice or return to the menu.");
            setLoadingState(LoadingState.ERROR);
            return;
        }

        if (!adventureStep) {
            setError("Failed to generate the next chapter. Please try making a different choice or restarting.");
            setLoadingState(LoadingState.ERROR);
            return;
        }
        
        updateCharacterProfiles(adventureStep.characters);
        
        let imageUrl: string = gameState?.imageUrl || ''; // Default to previous image

        if (userSettings.generateImages) {
            setLoadingState(LoadingState.GENERATING_IMAGE);
            const imageResult = await generateAdventureImage(adventureStep.imagePrompt);

            if (imageResult === 'RATE_LIMITED') {
                const disableImagesPermanently = window.confirm("Image generation has reached its quota limit. Would you like to disable images for the rest of this adventure to avoid further errors?");
                if (disableImagesPermanently) {
                    setUserSettings(prev => ({ ...prev!, generateImages: false }));
                    // imageUrl is already set to the previous one, so we just proceed
                } else {
                    setError("Image generation failed. You can go back, try another choice, or return to the main menu.");
                    setLoadingState(LoadingState.ERROR);
                    return;
                }
            } else if (!imageResult) {
                setError("The vision for the next scene is unclear. Please try making a different choice or restarting.");
                setLoadingState(LoadingState.ERROR);
                return;
            } else {
                imageUrl = imageResult;
            }
        }

        const newGameState: GameState = {
            story: adventureStep.story,
            translatedStory: adventureStep.translatedStory,
            imageUrl,
            choices: adventureStep.choices,
            vocabulary: adventureStep.vocabulary,
        };
        
        const newHistory = [...currentHistory, newGameState];
        setHistory(newHistory);
        setCurrentStepIndex(newHistory.length - 1);
        setLoadingState(LoadingState.IDLE);
    };

    const handleGoBack = () => {
        if (currentStepIndex > 0) {
            setCurrentStepIndex(prev => prev - 1);
        }
    };

    const handleGoNext = () => {
        if (currentStepIndex < history.length - 1) {
            setCurrentStepIndex(prev => prev + 1);
        }
    };

    const handleSaveWord = (item: VocabularyItem) => {
        if (!notebook.some(savedItem => 
            savedItem.word.toLowerCase() === item.word.toLowerCase() && 
            savedItem.translation.toLowerCase() === item.translation.toLowerCase())
        ) {
            const newItem: SavedVocabularyItem = {
                ...item,
                id: `${item.word}-${Date.now()}`,
                dateAdded: new Date().toISOString(),
                correctCount: 0,
                incorrectCount: 0,
            };
            setNotebook(prev => [newItem, ...prev]);
        }
    };

    const handleDeleteWord = (id: string) => {
        setNotebook(prev => prev.filter(item => item.id !== id));
    };

    const handleUpdateNotebook = (newNotebook: SavedVocabularyItem[]) => {
        setNotebook(newNotebook);
    }

    const handleReturnToMenu = () => {
        setAppScreen(AppScreen.SETUP);
        setError(null);
        setLoadingState(LoadingState.IDLE);
    };
    
    const handleToggleImageGeneration = () => {
        setUserSettings(prevSettings => {
            if (!prevSettings) return null;
            return { ...prevSettings, generateImages: !prevSettings.generateImages };
        });
    };

    const handleClearCorruptedSave = () => {
        safeRemoveItem(SAVE_GAME_KEY);
        setHasSaveData(false);
        setError(null);
    };

    const handleClearOldHistory = () => {
        if (!history || history.length <= MAX_HISTORY_LENGTH) return;
        
        const confirmed = window.confirm(
            `Your adventure has ${history.length} steps, which is quite large. Would you like to clear older steps to free up space? This will keep the most recent ${MAX_HISTORY_LENGTH} steps.`
        );
        
        if (confirmed) {
            const startIndex = Math.max(0, currentStepIndex - Math.floor(MAX_HISTORY_LENGTH / 2));
            const endIndex = Math.min(history.length, startIndex + MAX_HISTORY_LENGTH);
            const newHistory = history.slice(startIndex, endIndex);
            const newCurrentIndex = Math.min(currentStepIndex - startIndex, newHistory.length - 1);
            
            setHistory(newHistory);
            setCurrentStepIndex(newCurrentIndex);
            
            // Also save to localStorage immediately
            const newSaveData = { userSettings: userSettings!, history: newHistory, currentStepIndex: newCurrentIndex, characterProfiles };
            const jsonString = JSON.stringify(newSaveData);
            safeSetItem(SAVE_GAME_KEY, jsonString);
        }
    };
    
    const isLoading = loadingState !== LoadingState.IDLE && loadingState !== LoadingState.ERROR;
    const isAtLatestStep = currentStepIndex === history.length - 1;

    if (appScreen === AppScreen.SETUP) {
        return <GameSetup 
            onStartGame={handleStartGame} 
            isLoading={isLoading || isRecovering} 
            onContinueGame={handleContinueGame}
            hasSaveData={hasSaveData}
            error={error} 
            onLoadGame={handleLoadGameFromFile}
            onClearCorruptedSave={handleClearCorruptedSave}
        />;
    }

    return (
        <div className="min-h-screen bg-gray-900 text-gray-200 p-4 sm:p-6 md:p-8 relative">
            {showSaveConfirmation && (
                <div className="fixed top-5 right-5 bg-green-600 text-white py-2 px-5 rounded-lg shadow-lg z-50 animate-save-confirm">
                    Game Saved!
                </div>
            )}
            <div className="max-w-7xl mx-auto">
                <header className="flex flex-wrap justify-between items-center mb-6 gap-4">
                    <div>
                      <h1 className="text-3xl md:text-4xl font-bold text-purple-300 tracking-wider">Gemini LinguaQuest</h1>
                      <p className="text-gray-400 text-sm">{userSettings?.genre} ({userSettings?.sourceLanguage} to {userSettings?.targetLanguage})</p>
                      {saveDataInfo && (
                        <p className="text-gray-500 text-xs">
                          Save: {saveDataInfo.steps} steps, {saveDataInfo.size}KB
                          {parseFloat(saveDataInfo.size) > 1000 && <span className="text-yellow-400 ml-1">⚠ Large save</span>}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center flex-wrap gap-2">
                        <button onClick={handleGoBack} disabled={currentStepIndex <= 0 || isLoading} className="bg-gray-800/70 hover:bg-gray-700/90 text-purple-300 font-semibold py-2 px-4 border border-gray-600/80 rounded-lg shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed">Go Back</button>
                        <button onClick={handleGoNext} disabled={isAtLatestStep || isLoading} className="bg-gray-800/70 hover:bg-gray-700/90 text-purple-300 font-semibold py-2 px-4 border border-gray-600/80 rounded-lg shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed">Go Next</button>
                        <button onClick={handleManualSave} disabled={isLoading} className="bg-gray-800/70 hover:bg-gray-700/90 text-purple-300 font-semibold py-2 px-4 border border-gray-600/80 rounded-lg shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed" title="Save full game data to file">Save Game</button>
                        {saveDataInfo && parseFloat(saveDataInfo.size) > 1000 && history.length > MAX_HISTORY_LENGTH && (
                            <button onClick={handleClearOldHistory} className="bg-yellow-600/70 hover:bg-yellow-700/90 text-white font-semibold py-2 px-4 border border-yellow-600/80 rounded-lg shadow-md transition-all text-sm" title="Clear older history to reduce save size">Clean History</button>
                        )}
                        <button onClick={() => setAppScreen(AppScreen.NOTEBOOK)} className="bg-gray-800/70 hover:bg-gray-700/90 text-purple-300 font-semibold py-2 px-4 border border-gray-600/80 rounded-lg shadow-md transition-all">Notebook ({notebook.length})</button>
                        <div className="flex items-center gap-2 bg-gray-800/70 border border-gray-600/80 rounded-lg px-3 py-1.5">
                            <label htmlFor="image-toggle" className="text-purple-300 font-semibold text-sm cursor-pointer" title="Toggle Image Generation">Images</label>
                            <button
                                id="image-toggle"
                                onClick={handleToggleImageGeneration}
                                disabled={isLoading}
                                className={`relative inline-flex items-center h-6 rounded-full w-11 transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-purple-500 ${
                                    userSettings?.generateImages ? 'bg-green-500' : 'bg-gray-600'
                                }`}
                            >
                                <span
                                    className={`inline-block w-4 h-4 transform bg-white rounded-full transition-transform duration-300 ${
                                        userSettings?.generateImages ? 'translate-x-6' : 'translate-x-1'
                                    }`}
                                />
                            </button>
                        </div>
                        <button onClick={handleReturnToMenu} className="bg-gray-800/70 hover:bg-gray-700/90 text-purple-300 font-semibold py-2 px-4 border border-gray-600/80 rounded-lg shadow-md transition-all">Main Menu</button>
                    </div>
                </header>

                {appScreen === AppScreen.NOTEBOOK && (
                    <main className="bg-black bg-opacity-30 rounded-2xl shadow-2xl shadow-purple-900/20 overflow-hidden min-h-[75vh]">
                       <NotebookView notebook={notebook} onUpdateNotebook={handleUpdateNotebook} onClose={() => setAppScreen(AppScreen.GAME)} onDelete={handleDeleteWord} />
                    </main>
                )}

                {appScreen === AppScreen.GAME && (
                     <main className="bg-black bg-opacity-30 rounded-2xl shadow-2xl shadow-purple-900/20 overflow-hidden">
                        <div className="relative w-full h-64 lg:h-80 bg-gray-800 group">
                            {(loadingState !== LoadingState.IDLE || error || !gameState?.imageUrl || !userSettings?.generateImages || isRecovering) && (
                                <div className="absolute inset-0 bg-gray-900/80 backdrop-blur-sm flex flex-col justify-center items-center z-10 p-4 text-center">
                                    {(isLoading || isRecovering) && <LoadingSpinner />}
                                    <p className="mt-4 text-gray-400">{getLoadingMessage()}</p>
                                    {error && <p className="mt-2 text-red-400">{error}</p>}
                                    {(!userSettings?.generateImages && !isLoading && !isRecovering) && <p className="mt-2 text-gray-500">Image generation is disabled.</p>}
                                    {error && <button onClick={handleReturnToMenu} className="mt-4 bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded transition-colors">Return to Menu</button>}
                                </div>
                            )}
                            {gameState?.imageUrl && (
                                <>
                                    <img src={gameState.imageUrl} alt="Adventure Scene" className={`w-full h-full object-contain transition-opacity duration-1000 ${isLoading || !userSettings?.generateImages || isRecovering ? 'opacity-30' : 'opacity-100'}`} />
                                    {!isLoading && !isRecovering && userSettings?.generateImages && (
                                        <button
                                            onClick={() => setIsImageFullscreen(true)}
                                            className="absolute top-2 right-2 bg-black/50 text-white p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity focus:opacity-100 outline-none focus:ring-2 focus:ring-purple-400 z-20"
                                            aria-label="View image in fullscreen"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 1v4m0 0h-4m4 0l-5-5" />
                                            </svg>
                                        </button>
                                    )}
                                </>
                            )}
                        </div>
                        
                        <div className="p-6 md:p-8">
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
                                <div className="lg:col-span-1">
                                    <h2 className="text-xl font-bold text-purple-300 mb-3">{userSettings?.sourceLanguage}</h2>
                                    <p className="text-lg leading-relaxed text-gray-300 whitespace-pre-wrap">{gameState?.story}</p>
                                </div>
                                <div className="lg:col-span-1">
                                    <h2 className="text-xl font-bold text-purple-300 mb-3">{userSettings?.targetLanguage}</h2>
                                    <p className="text-lg leading-relaxed text-gray-400 whitespace-pre-wrap">{gameState?.translatedStory}</p>
                                </div>
                                <div className="lg:col-span-1">
                                    <h2 className="text-xl font-bold text-purple-300 mb-3">Vocabulary</h2>
                                    {gameState?.vocabulary && gameState.vocabulary.length > 0 ? (
                                        <ul className="space-y-2">
                                            {gameState.vocabulary.map((item, index) => (
                                                <li key={index} className="flex items-center justify-between text-gray-300">
                                                    <span>{item.word}: <span className="text-gray-400">{item.translation}</span></span>
                                                    <button onClick={() => handleSaveWord(item)} title="Save to notebook" className="text-gray-500 hover:text-purple-400 disabled:text-gray-700 disabled:cursor-not-allowed" disabled={notebook.some(i => i.word.toLowerCase() === item.word.toLowerCase())}>
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                                            <path d="M5 4a2 2 0 012-2h6a2 2 0 012 2v14l-5-3.125L5 18V4z" />
                                                        </svg>
                                                    </button>
                                                </li>
                                            ))}
                                        </ul>
                                    ) : ( <p className="text-gray-500">No new vocabulary.</p>)}
                                </div>
                            </div>

                            <div>
                                <h2 className="text-xl font-bold text-purple-300 mb-4">What do you do?</h2>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {(gameState?.choices && gameState.choices.length > 0 && isAtLatestStep) ? (
                                        gameState.choices.map((choice, index) => (
                                            <ChoiceButton key={index} item={choice} onClick={() => handleChoice(choice)} disabled={isLoading} />
                                        ))
                                    ) : (
                                        !isLoading && !error && (isAtLatestStep ? <p className="text-gray-500">The story continues...</p> : <p className="text-gray-500">You are viewing past events. Go forward to continue the story.</p>)
                                    )}
                                </div>
                            </div>
                        </div>
                    </main>
                )}
            </div>
            {isImageFullscreen && gameState?.imageUrl && (
                <div 
                    className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex justify-center items-center p-4 animate-fade-in"
                    onClick={() => setIsImageFullscreen(false)}
                    role="dialog"
                    aria-modal="true"
                    aria-label="Fullscreen image view"
                >
                    <button 
                        className="absolute top-4 right-4 text-white bg-black/50 p-2 rounded-full hover:bg-black/75 transition-colors z-10"
                        aria-label="Close fullscreen view"
                        onClick={() => setIsImageFullscreen(false)}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                    <img 
                        src={gameState.imageUrl} 
                        alt="Adventure Scene Fullscreen" 
                        className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    />
                </div>
            )}
        </div>
    );
};

export default App;