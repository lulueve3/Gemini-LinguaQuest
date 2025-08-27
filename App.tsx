import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { LoadingState, GameState, AppScreen, UserSettings, VocabularyItem, SavedVocabularyItem, SaveData, ChoiceItem, CharacterProfile, ImageRecord } from './types';
import { generateAdventureStep, generateAdventureImage, translateWord } from './services/geminiService';
import { db, clearAllData, HistoryStep, SessionData } from './services/dbService';
import { speak, stop } from './services/ttsService';
import ChoiceButton from './components/ChoiceButton';
import LoadingSpinner from './components/LoadingSpinner';
import GameSetup from './components/GameSetup';
import NotebookView from './components/NotebookView';

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


const App: React.FC = () => {
    const [appScreen, setAppScreen] = useState<AppScreen>(AppScreen.SETUP);
    const [userSettings, setUserSettings] = useState<UserSettings | null>(null);
    const [history, setHistory] = useState<GameState[]>([]);
    const [characterProfiles, setCharacterProfiles] = useState<CharacterProfile[]>([]);
    const [currentStepIndex, setCurrentStepIndex] = useState<number>(-1);
    const [loadingState, setLoadingState] = useState<LoadingState>(LoadingState.IDLE);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [notebook, setNotebook] = useState<SavedVocabularyItem[]>([]);
    const [hasSaveData, setHasSaveData] = useState<boolean>(false);
    const [showSaveConfirmation, setShowSaveConfirmation] = useState(false);
    const [isRecovering, setIsRecovering] = useState(false);
    const [saveDataInfo, setSaveDataInfo] = useState<{size: string, steps: number} | null>(null);
    const [isImageFullscreen, setIsImageFullscreen] = useState(false);
    const [currentImageUrl, setCurrentImageUrl] = useState<string>('');
    const [showStorageWarning, setShowStorageWarning] = useState(false);
    const [selectedInteractiveWords, setSelectedInteractiveWords] = useState<VocabularyItem[]>([]);
    const [translatingWord, setTranslatingWord] = useState<string | null>(null);
    const [speakingState, setSpeakingState] = useState<{ type: 'story' | 'word'; key: string } | null>(null);


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

    const updateSaveDataInfo = useCallback(async () => {
        if (history.length > 0) {
            try {
                const jsonBytes = JSON.stringify({ userSettings, history, currentStepIndex, characterProfiles }).length;
                const images = await db.images.toArray();
                const imageBytes = images.reduce((sum, record) => sum + record.blob.size, 0);
                const totalBytes = jsonBytes + imageBytes;
                
                const sizeMB = (totalBytes / (1024 * 1024)).toFixed(1);
                setSaveDataInfo({ size: sizeMB, steps: history.length });
                
                setShowStorageWarning(totalBytes > STORAGE_WARNING_THRESHOLD_BYTES);

            } catch (e) {
                console.error("Could not calculate storage size:", e);
                setSaveDataInfo(null);
                setShowStorageWarning(false);
            }
        } else {
            setSaveDataInfo(null);
            setShowStorageWarning(false);
        }
    }, [userSettings, history, currentStepIndex, characterProfiles]);
    
    useEffect(() => {
        updateSaveDataInfo();
    }, [history, updateSaveDataInfo]);

    const handleManualSave = async () => {
        if (!userSettings || history.length === 0) {
            setError("No game data to save.");
            return;
        }

        try {
            const session = await db.session.get(SESSION_ID);
            const dbHistory = await db.history.toArray();
            
            if (!session) throw new Error("Session data not found in DB.");

            const historyForSave: GameState[] = await Promise.all(
                dbHistory.map(async (step) => {
                    let imageUrl = '';
                    if (step.imageId) {
                        const imageRecord = await db.images.get(step.imageId);
                        if (imageRecord) {
                            imageUrl = await blobToBase64(imageRecord.blob);
                        }
                    }
                    return { ...step, imageUrl, imageId: step.imageId, selectedChoiceIndex: step.selectedChoiceIndex };
                })
            );

            const saveData: SaveData = {
                userSettings: session.userSettings,
                history: historyForSave,
                currentStepIndex: session.currentStepIndex,
                characterProfiles: session.characterProfiles
            };

            const jsonString = JSON.stringify(saveData, null, 2);
            const blob = new Blob([jsonString], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const genreSlug = (userSettings.genre || 'adventure').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
            a.download = `gemini-linguaquest-save-${genreSlug}-${Date.now()}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            setShowSaveConfirmation(true);
            setTimeout(() => setShowSaveConfirmation(false), 3000);

        } catch (err) {
            console.error('Failed to create save file:', err);
            setError('Failed to create save file. Please try again.');
        }
    };

    const handleContinueGame = useCallback(async () => {
        setIsRecovering(true);
        setError(null);
        setSuccessMessage(null);
        try {
            const session = await db.session.get(SESSION_ID);
            const historySteps = await db.history.toArray();
            
            if (!session || historySteps.length === 0) {
                throw new Error("No saved game found in the database.");
            }

            setUserSettings(session.userSettings);
            setCharacterProfiles(session.characterProfiles);
            const historyWithImageIds = historySteps.map(step => ({ ...step, imageUrl: '' })); // imageUrl will be loaded by effect
            setHistory(historyWithImageIds);
            setCurrentStepIndex(session.currentStepIndex);
            
            setAppScreen(AppScreen.GAME);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Could not load game.';
            console.error("Failed to load game from DB", err);
            setError(`Failed to load save: ${message}`);
            await clearAllData();
            setHasSaveData(false);
        } finally {
            setIsRecovering(false);
        }
    }, []);

    const handleLoadGameFromFile = (file: File) => {
        setIsRecovering(true);
        setError(null);
        setSuccessMessage(null);
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const text = e.target?.result as string;
                if (!text) throw new Error("File is empty.");
                
                const parsedData = JSON.parse(text) as SaveData;
                
                if (!parsedData.userSettings || !Array.isArray(parsedData.history) || typeof parsedData.currentStepIndex !== 'number' || !Array.isArray(parsedData.characterProfiles)) {
                    throw new Error("Invalid or corrupted save file format.");
                }
                
                await clearAllData();

                const imageRecords: ImageRecord[] = [];
                const historyForState = parsedData.history.map(step => {
                    let imageId = '';
                    if (step.imageUrl && step.imageUrl.startsWith('data:')) {
                        imageId = crypto.randomUUID();
                        const blob = base64ToBlob(step.imageUrl, 'image/jpeg');
                        imageRecords.push({ id: imageId, blob });
                    }
                    return {
                        ...step,
                        imageId: imageId,
                        imageUrl: '',
                    };
                });

                await db.transaction('rw', db.session, db.history, db.images, async () => {
                    if (imageRecords.length > 0) {
                        await db.images.bulkAdd(imageRecords);
                    }

                    const historyStepsForDb: HistoryStep[] = historyForState.map(s => ({
                        story: s.story,
                        translatedStory: s.translatedStory,
                        choices: s.choices,
                        vocabulary: s.vocabulary,
                        imageId: s.imageId || '',
                        selectedChoiceIndex: s.selectedChoiceIndex,
                    }));
                    await db.history.bulkAdd(historyStepsForDb);

                    const sessionData: SessionData = {
                        id: SESSION_ID,
                        userSettings: parsedData.userSettings,
                        currentStepIndex: parsedData.currentStepIndex,
                        characterProfiles: parsedData.characterProfiles,
                    };
                    await db.session.put(sessionData);
                });

                setUserSettings(parsedData.userSettings);
                setCharacterProfiles(parsedData.characterProfiles);
                setHistory(historyForState);
                setCurrentStepIndex(parsedData.currentStepIndex);
                setHasSaveData(true);
                setAppScreen(AppScreen.GAME);

            } catch (err) {
                const message = err instanceof Error ? err.message : 'Could not load game from file.';
                console.error("Failed to load game from file", err);
                setError(`Failed to load save file: ${message}`);
                await clearAllData();
                setHasSaveData(false);
            } finally {
                setIsRecovering(false);
            }
        };
        reader.readAsText(file);
    };
    
    const updateCharacterProfiles = (newProfiles: CharacterProfile[]) => {
        if (!newProfiles || newProfiles.length === 0) return;
        
        const updatedProfiles = [...characterProfiles];
        const profilesMap = new Map(updatedProfiles.map(p => [p.name.toLowerCase(), p]));
        newProfiles.forEach(newProfile => {
            if (newProfile.name && newProfile.description) {
                profilesMap.set(newProfile.name.toLowerCase(), newProfile);
            }
        });
        const finalProfiles = Array.from(profilesMap.values());
        setCharacterProfiles(finalProfiles);
        db.session.where({ id: SESSION_ID }).modify({ characterProfiles: finalProfiles });
    };

    const getLoadingMessage = () => {
        if (isRecovering) return "Recovering your adventure...";
        switch (loadingState) {
            case LoadingState.GENERATING_STORY: return "The dungeon master is weaving your fate...";
            case LoadingState.GENERATING_IMAGE: return "A magical artist is painting your scene...";
            case LoadingState.ERROR: return "A mysterious force has interfered...";
            default: return "";
        }
    };
    
    const handleStartGame = useCallback(async (settings: UserSettings) => {
        setLoadingState(LoadingState.GENERATING_STORY);
        setError(null);
        setSuccessMessage(null);
        await clearAllData();
        setHistory([]);
        setCurrentStepIndex(-1);
        setUserSettings(settings);
        setCharacterProfiles([]);
        setAppScreen(AppScreen.GAME);

        const adventureStep = await generateAdventureStep(settings.prompt, settings, []);

        if (!adventureStep || adventureStep === 'RPC_ERROR') {
            setError("Failed to generate the story's beginning. Please try again.");
            setLoadingState(LoadingState.ERROR);
            return;
        }
        
        updateCharacterProfiles(adventureStep.characters);
        let imageId = '';
        if (settings.generateImages) {
            setLoadingState(LoadingState.GENERATING_IMAGE);
            const imageResult = await generateAdventureImage(adventureStep.imagePrompt);
            if (imageResult && imageResult !== 'RATE_LIMITED') {
                imageId = crypto.randomUUID();
                const blob = base64ToBlob(imageResult, 'image/jpeg');
                await db.images.add({ id: imageId, blob });
            } else {
                console.warn("Image generation failed or was rate-limited on start.");
            }
        }
        
        const newHistoryStep: HistoryStep = {
            story: adventureStep.story,
            translatedStory: adventureStep.translatedStory,
            imageId,
            choices: adventureStep.choices,
            vocabulary: adventureStep.vocabulary,
        };
        
        await db.history.add(newHistoryStep);

        const newSession: SessionData = {
            id: SESSION_ID,
            userSettings: settings,
            currentStepIndex: 0,
            characterProfiles: adventureStep.characters
        };
        await db.session.put(newSession);

        setHistory([{ ...newHistoryStep, imageUrl: '' }]);
        setCurrentStepIndex(0);
        setHasSaveData(true);
        setLoadingState(LoadingState.IDLE);
    }, []);

    const handleChoice = async (choice: ChoiceItem) => {
        if (!gameState || !userSettings) return;

        setLoadingState(LoadingState.GENERATING_STORY);
        setError(null);
        
        const choiceIndex = gameState.choices.findIndex(c => c.choice === choice.choice);
        const storyContext = history.slice(0, currentStepIndex + 1).map(h => h.story).slice(-3).join('\n\n');
        const nextPrompt = `Continue the story based on the player's last choice. The story's source language is ${userSettings.sourceLanguage} and the target language for translation is ${userSettings.targetLanguage}.\n\nPREVIOUS STORY:\n${storyContext}\n\nPLAYER'S CHOICE: "${choice.choice}"`;

        const adventureStep = await generateAdventureStep(nextPrompt, userSettings, characterProfiles);

        if (!adventureStep || adventureStep === 'RPC_ERROR') {
            setError("Failed to generate the next chapter. Please try a different choice.");
            setLoadingState(LoadingState.ERROR);
            return;
        }
        
        updateCharacterProfiles(adventureStep.characters);
        
        let imageId = '';
        if (userSettings.generateImages) {
            setLoadingState(LoadingState.GENERATING_IMAGE);
            const imageResult = await generateAdventureImage(adventureStep.imagePrompt);
            if (imageResult && imageResult !== 'RATE_LIMITED') {
                imageId = crypto.randomUUID();
                const blob = base64ToBlob(imageResult, 'image/jpeg');
                await db.images.add({ id: imageId, blob });
            }
        }

        const newHistoryStep: HistoryStep = {
            story: adventureStep.story,
            translatedStory: adventureStep.translatedStory,
            imageId,
            choices: adventureStep.choices,
            vocabulary: adventureStep.vocabulary,
        };

        const updatedCurrentStep: GameState = { ...history[currentStepIndex], selectedChoiceIndex: choiceIndex };
        const newHistoryForState = [
            ...history.slice(0, currentStepIndex),
            updatedCurrentStep,
            { ...newHistoryStep, imageUrl: '' }
        ];
        
        await db.transaction('rw', db.history, db.session, async () => {
            const dbHistory = await db.history.toArray();
            const currentDbStep = dbHistory[currentStepIndex];

            if (!currentDbStep || typeof currentDbStep.id === 'undefined') {
                console.error("Critical error: Could not find current step in DB.");
                throw new Error("DB state is out of sync.");
            }

            const idsToDelete = dbHistory.slice(currentStepIndex + 1).map(s => s.id!).filter(id => id !== undefined);
            if (idsToDelete.length > 0) {
                await db.history.bulkDelete(idsToDelete);
            }
            
            await db.history.update(currentDbStep.id, { selectedChoiceIndex: choiceIndex });
            await db.history.add(newHistoryStep);
            await db.session.update(SESSION_ID, { currentStepIndex: newHistoryForState.length - 1 });
        });
        
        setHistory(newHistoryForState);
        setCurrentStepIndex(newHistoryForState.length - 1);
        setLoadingState(LoadingState.IDLE);
    };

    const handleGoBack = () => {
        if (currentStepIndex > 0) setCurrentStepIndex(prev => prev - 1);
    };
    const handleGoNext = () => {
        if (currentStepIndex < history.length - 1) setCurrentStepIndex(prev => prev + 1);
    };

    const handleSaveWord = async (item: VocabularyItem) => {
        if (notebookWordsSet.has(item.word.toLowerCase())) return;

        const newItem: SavedVocabularyItem = {
            ...item,
            id: `${item.word}-${Date.now()}`,
            dateAdded: new Date().toISOString(),
            correctCount: 0,
            incorrectCount: 0,
        };
        await db.notebook.add(newItem);
        setNotebook(prev => [newItem, ...prev].sort((a,b) => new Date(b.dateAdded).getTime() - new Date(a.dateAdded).getTime()));
    };
    
    const handleSaveAllSelectedWords = async () => {
        if (unsavedSelectedWords.length === 0) return;

        const newSavedItems: SavedVocabularyItem[] = unsavedSelectedWords.map(item => ({
            ...item,
            id: `${item.word}-${Date.now()}`,
            dateAdded: new Date().toISOString(),
            correctCount: 0,
            incorrectCount: 0,
        }));

        await db.notebook.bulkAdd(newSavedItems);
        setNotebook(prev => [...newSavedItems, ...prev].sort((a,b) => new Date(b.dateAdded).getTime() - new Date(a.dateAdded).getTime()));
    };

    const handleWordSelection = async (word: string) => {
        const cleanedWord = word.trim();
        const lowerCaseWord = cleanedWord.toLowerCase();

        if (!lowerCaseWord || translatingWord) return;
    
        const existingPair = selectedInteractiveWords.find(p => p.word.toLowerCase() === lowerCaseWord);
    
        if (existingPair) {
            setSelectedInteractiveWords(prev => prev.filter(p => p.word.toLowerCase() !== lowerCaseWord));
        } else {
            setTranslatingWord(lowerCaseWord);
            let translation: string | null = null;
    
            const vocabItem = gameState?.vocabulary.find(v => v.word.toLowerCase() === lowerCaseWord);
            if (vocabItem) {
                translation = vocabItem.translation;
            } else if (userSettings && gameState) {
                translation = await translateWord(
                    cleanedWord, 
                    userSettings.sourceLanguage, 
                    userSettings.targetLanguage,
                    gameState.story,
                    gameState.translatedStory
                );
            }
            
            if (translation) {
                setSelectedInteractiveWords(prev => [...prev, { word: cleanedWord, translation: translation! }]);
            } else {
                console.error("Could not translate word:", cleanedWord);
            }
    
            setTranslatingWord(null);
        }
    };

    const handleDeleteWord = async (id: string) => {
        await db.notebook.delete(id);
        setNotebook(prev => prev.filter(item => item.id !== id));
    };

    const handleUpdateNotebook = async (newNotebook: SavedVocabularyItem[]) => {
        await db.notebook.bulkPut(newNotebook);
        setNotebook(newNotebook.sort((a,b) => new Date(b.dateAdded).getTime() - new Date(a.dateAdded).getTime()));
    }

    const handleReturnToMenu = () => {
        setAppScreen(AppScreen.SETUP);
        setError(null);
        setLoadingState(LoadingState.IDLE);
    };
    
    const handleToggleImageGeneration = () => {
        if (userSettings) {
            const newSettings = { ...userSettings, generateImages: !userSettings.generateImages };
            setUserSettings(newSettings);
            db.session.update(SESSION_ID, { userSettings: newSettings });
        }
    };
    
    const handleClearData = async () => {
        if (window.confirm("Are you sure you want to delete all saved game data? This cannot be undone.")) {
            await clearAllData();
            setHasSaveData(false);
            setError(null);
        }
    };

    const handleSpeak = (type: 'story' | 'word', key: string, text: string, langName: string) => {
        const currentSpeakingKey = speakingState?.type === type && speakingState?.key === key;
        
        if (currentSpeakingKey) {
            stop();
            setSpeakingState(null);
        } else {
            setSpeakingState({ type, key });
            const langCode = langToCode(langName);
            speak(text, langCode, () => setSpeakingState(null), () => setSpeakingState(null));
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
            successMessage={successMessage}
            onLoadGame={handleLoadGameFromFile}
            onClearData={handleClearData}
        />;
    }

    return (
        <div className="min-h-screen bg-gray-900 text-gray-200 p-4 sm:p-6 md:p-8 relative">
            {showSaveConfirmation && (
                <div className="fixed top-5 right-5 bg-green-600 text-white py-2 px-5 rounded-lg shadow-lg z-50 animate-save-confirm">
                    Game Saved to File!
                </div>
            )}
            <div className="max-w-7xl mx-auto">
                <header className="flex flex-wrap justify-between items-center mb-6 gap-4">
                    <div>
                      <h1 className="text-3xl md:text-4xl font-bold text-purple-300 tracking-wider">Gemini LinguaQuest</h1>
                      <p className="text-gray-400 text-sm">{userSettings?.genre} ({userSettings?.sourceLanguage} to {userSettings?.targetLanguage})</p>
                       {saveDataInfo && (
                        <p className="text-gray-500 text-xs">
                          {saveDataInfo.steps} steps in history (~{saveDataInfo.size} MB).
                        </p>
                      )}
                    </div>
                    <div className="flex items-center flex-wrap gap-2">
                        <button onClick={handleGoBack} disabled={currentStepIndex <= 0 || isLoading} className="bg-gray-800/70 hover:bg-gray-700/90 text-purple-300 font-semibold py-2 px-4 border border-gray-600/80 rounded-lg shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed">Go Back</button>
                        <button onClick={handleGoNext} disabled={isAtLatestStep || isLoading} className="bg-gray-800/70 hover:bg-gray-700/90 text-purple-300 font-semibold py-2 px-4 border border-gray-600/80 rounded-lg shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed">Go Next</button>
                        <button onClick={handleManualSave} disabled={isLoading} className="bg-gray-800/70 hover:bg-gray-700/90 text-purple-300 font-semibold py-2 px-4 border border-gray-600/80 rounded-lg shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed" title="Save full game data to file">Save Game</button>
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
                    <>
                        {showStorageWarning && (
                            <div className="bg-yellow-900/60 border border-yellow-700/80 text-yellow-200 p-4 rounded-lg mb-4 text-center animate-fade-in">
                                <h3 className="font-bold text-lg mb-2 flex items-center justify-center gap-2">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                                    Storage Warning
                                </h3>
                                <p className="mb-3 text-sm">Your adventure's data is getting large! To prevent potential data loss from browser storage limits, it is highly recommended to save your progress to a file.</p>
                                <button onClick={handleManualSave} disabled={isLoading} className="bg-yellow-600 hover:bg-yellow-700 text-white font-bold py-2 px-4 rounded transition-colors disabled:opacity-50">
                                Save to File Now
                                </button>
                            </div>
                        )}
                        <main className="bg-black bg-opacity-30 rounded-2xl shadow-2xl shadow-purple-900/20 overflow-hidden">
                            <div className="relative w-full h-64 lg:h-80 bg-gray-800 group">
                                {(loadingState !== LoadingState.IDLE || error || !currentImageUrl || !userSettings?.generateImages || isRecovering) && (
                                    <div className="absolute inset-0 bg-gray-900/80 backdrop-blur-sm flex flex-col justify-center items-center z-10 p-4 text-center">
                                        {(isLoading || isRecovering) && <LoadingSpinner />}
                                        <p className="mt-4 text-gray-400">{getLoadingMessage()}</p>
                                        {error && <p className="mt-2 text-red-400">{error}</p>}
                                        {(!userSettings?.generateImages && !isLoading && !isRecovering) && <p className="mt-2 text-gray-500">Image generation is disabled.</p>}
                                        {error && <button onClick={handleReturnToMenu} className="mt-4 bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded transition-colors">Return to Menu</button>}
                                    </div>
                                )}
                                {currentImageUrl && (
                                    <>
                                        <img src={currentImageUrl} alt="Adventure Scene" className={`w-full h-full object-contain transition-opacity duration-1000 ${isLoading || !userSettings?.generateImages || isRecovering ? 'opacity-30' : 'opacity-100'}`} />
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
                                        <div className="flex items-center gap-2 mb-3">
                                            <h2 className="text-xl font-bold text-purple-300">{userSettings?.sourceLanguage}</h2>
                                            <button 
                                                onClick={() => handleSpeak('story', 'source', gameState?.story ?? '', userSettings?.sourceLanguage ?? 'English')} 
                                                className="text-purple-300 hover:text-purple-200"
                                                title={`Read ${userSettings?.sourceLanguage} story`}
                                            >
                                                {speakingState?.type === 'story' && speakingState?.key === 'source' ? (
                                                     <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor"><path d="M7 7h10v10H7z"/></svg>
                                                ) : (
                                                     <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.14v14l11-7-11-7z"/></svg>
                                                )}
                                            </button>
                                        </div>
                                        <InteractiveText
                                            text={gameState?.story ?? ''}
                                            onWordClick={handleWordSelection}
                                            highlightedWords={selectedInteractiveWords.map((p, i) => ({ word: p.word, index: i + 1 }))}
                                            lang="source"
                                            translatingWord={translatingWord}
                                        />
                                    </div>
                                    <div className="lg:col-span-1">
                                        <div className="flex items-center gap-2 mb-3">
                                            <h2 className="text-xl font-bold text-purple-300">{userSettings?.targetLanguage}</h2>
                                             <button 
                                                onClick={() => handleSpeak('story', 'target', gameState?.translatedStory ?? '', userSettings?.targetLanguage ?? 'English')} 
                                                className="text-purple-300 hover:text-purple-200"
                                                title={`Read ${userSettings?.targetLanguage} story`}
                                            >
                                                {speakingState?.type === 'story' && speakingState?.key === 'target' ? (
                                                     <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor"><path d="M7 7h10v10H7z"/></svg>
                                                ) : (
                                                     <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.14v14l11-7-11-7z"/></svg>
                                                )}
                                            </button>
                                        </div>
                                        <InteractiveText
                                            text={gameState?.translatedStory ?? ''}
                                            highlightedWords={selectedInteractiveWords.map((p, i) => ({ word: p.translation, index: i + 1 }))}
                                            lang="target"
                                        />
                                    </div>
                                    <div className="lg:col-span-1">
                                        <h2 className="text-xl font-bold text-purple-300 mb-3">Vocabulary</h2>
                                        {gameState?.vocabulary && gameState.vocabulary.length > 0 ? (
                                            <ul className="space-y-2">
                                                {gameState.vocabulary.map((item, index) => (
                                                    <li key={index} className="flex items-center justify-between text-gray-300">
                                                        <div className="flex items-center gap-2">
                                                            <button 
                                                                onClick={() => handleSpeak('word', item.word, item.word, userSettings?.sourceLanguage ?? 'English')}
                                                                className="text-gray-400 hover:text-purple-300"
                                                                title={`Pronounce "${item.word}"`}
                                                            >
                                                                {speakingState?.type === 'word' && speakingState?.key === item.word ? (
                                                                     <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM12.293 7.293a1 1 0 011.414 0L15 8.586l1.293-1.293a1 1 0 111.414 1.414L16.414 10l1.293 1.293a1 1 0 01-1.414 1.414L15 11.414l-1.293 1.293a1 1 0 01-1.414-1.414L13.586 10l-1.293-1.293a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                                                                ) : (
                                                                     <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                                                                )}
                                                            </button>
                                                            <span>{item.word}: <span className="text-gray-400">{item.translation}</span></span>
                                                        </div>
                                                        <button onClick={() => handleSaveWord(item)} title="Save to notebook" className="text-gray-500 hover:text-purple-400 disabled:text-gray-700 disabled:cursor-not-allowed" disabled={notebookWordsSet.has(item.word.toLowerCase())}>
                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                                                <path d="M5 4a2 2 0 012-2h6a2 2 0 012 2v14l-5-3.125L5 18V4z" />
                                                            </svg>
                                                        </button>
                                                    </li>
                                                ))}
                                            </ul>
                                        ) : ( <p className="text-gray-500">No new vocabulary.</p>)}

                                        {selectedInteractiveWords.length > 0 && (
                                            <div className="mt-6">
                                                <div className="flex justify-between items-center mb-2">
                                                    <h3 className="text-base font-bold text-purple-300 flex items-center gap-2">
                                                        Selected Words
                                                    </h3>
                                                    <button
                                                        onClick={handleSaveAllSelectedWords}
                                                        disabled={unsavedSelectedWords.length === 0}
                                                        className="bg-purple-600/50 hover:bg-purple-600/80 text-white text-xs font-bold py-1 px-3 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                        title={unsavedSelectedWords.length > 0 ? `Save ${unsavedSelectedWords.length} new words` : "All selected words are already in notebook"}
                                                    >
                                                        Save All ({unsavedSelectedWords.length})
                                                    </button>
                                                </div>
                                                <ul className="space-y-2 p-4 bg-gray-800/50 rounded-lg border border-purple-500/30 animate-fade-in">
                                                    {selectedInteractiveWords.map((item, index) => (
                                                        <li key={`${item.word}-${index}`} className="flex items-center justify-between text-gray-300">
                                                            <div className="flex items-center gap-2">
                                                                <button 
                                                                    onClick={() => handleSpeak('word', `selected-${item.word}`, item.word, userSettings?.sourceLanguage ?? 'English')}
                                                                    className="text-gray-400 hover:text-purple-300"
                                                                    title={`Pronounce "${item.word}"`}
                                                                >
                                                                    {speakingState?.type === 'word' && speakingState?.key === `selected-${item.word}` ? (
                                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM12.293 7.293a1 1 0 011.414 0L15 8.586l1.293-1.293a1 1 0 111.414 1.414L16.414 10l1.293 1.293a1 1 0 01-1.414 1.414L15 11.414l-1.293 1.293a1 1 0 01-1.414-1.414L13.586 10l-1.293-1.293a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                                                                    ) : (
                                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                                                                    )}
                                                                </button>
                                                                <span><span className="font-bold">{item.word}</span>: <span className="text-gray-400">{item.translation}</span></span>
                                                            </div>
                                                            <button onClick={() => handleSaveWord(item)} title="Save to notebook" className="text-gray-500 hover:text-purple-400 disabled:text-gray-700 disabled:cursor-not-allowed" disabled={notebookWordsSet.has(item.word.toLowerCase())}>
                                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                                                    <path d="M5 4a2 2 0 012-2h6a2 2 0 012 2v14l-5-3.125L5 18V4z" />
                                                                </svg>
                                                            </button>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                
                                <div className="mt-8">
                                    <h2 className="text-2xl font-bold text-center text-purple-300 mb-6">Your Next Move</h2>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {gameState?.choices.map((item, index) => (
                                            <ChoiceButton
                                                key={index}
                                                item={item}
                                                onClick={() => handleChoice(item)}
                                                disabled={isLoading || !isAtLatestStep}
                                                isSelected={gameState.selectedChoiceIndex === index}
                                            />
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </main>
                    </>
                )}
            </div>
            {isImageFullscreen && currentImageUrl && (
                <div 
                    className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4 animate-fade-in"
                    onClick={() => setIsImageFullscreen(false)}
                >
                    <img src={currentImageUrl} alt="Fullscreen Adventure Scene" className="max-h-full max-w-full object-contain" />
                    <button 
                        onClick={() => setIsImageFullscreen(false)}
                        className="absolute top-4 right-4 text-white bg-black/50 p-2 rounded-full hover:bg-black/70"
                        aria-label="Close fullscreen view"
                    >
                         <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            )}
        </div>
    );
};

export default App;