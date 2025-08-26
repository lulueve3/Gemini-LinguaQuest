import React, { useState, useEffect, useCallback } from 'react';
import { LoadingState, GameState, AppScreen, UserSettings, VocabularyItem, SavedVocabularyItem, SaveData, ChoiceItem, CharacterProfile } from './types';
import { generateAdventureStep, generateAdventureImage } from './services/geminiService';
import { db, clearAllData, HistoryStep, SessionData } from './services/dbService';
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
    const [currentImageUrl, setCurrentImageUrl] = useState<string>('');
    const [showStorageWarning, setShowStorageWarning] = useState(false);

    const gameState = history[currentStepIndex] ?? null;

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
                    return { ...step, imageUrl, imageId: step.imageId };
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
            a.download = `gemini-linguaquest-save-${Date.now()}.json`;
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
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const text = e.target?.result as string;
                if (!text) throw new Error("File is empty.");
                
                const parsedData = JSON.parse(text) as SaveData;
                // Add validation here if needed
                
                await clearAllData();

                await db.transaction('rw', db.session, db.history, db.images, async () => {
                    const historyPromises = parsedData.history.map(async (step) => {
                        let imageId = '';
                        if (step.imageUrl && step.imageUrl.startsWith('data:')) {
                            imageId = crypto.randomUUID();
                            const blob = base64ToBlob(step.imageUrl, 'image/jpeg');
                            await db.images.add({ id: imageId, blob });
                        }
                        const historyStep: HistoryStep = {
                            story: step.story,
                            translatedStory: step.translatedStory,
                            choices: step.choices,
                            vocabulary: step.vocabulary,
                            imageId: imageId,
                        };
                        return db.history.add(historyStep);
                    });
                    await Promise.all(historyPromises);

                    const sessionData: SessionData = {
                        id: SESSION_ID,
                        userSettings: parsedData.userSettings,
                        currentStepIndex: parsedData.currentStepIndex,
                        characterProfiles: parsedData.characterProfiles,
                    };
                    await db.session.put(sessionData);
                });

                // Now load the state into the app
                await handleContinueGame();

            } catch (err) {
                const message = err instanceof Error ? err.message : 'Could not load game from file.';
                console.error("Failed to load game from file", err);
                setError(`Failed to load save file: ${message}`);
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
        
        const storyContext = history.slice(0, currentStepIndex + 1).map(h => h.story).slice(-3).join('\n\n');
        const nextPrompt = `Continue the story based on the player's last choice. The story's source language is ${userSettings.sourceLanguage} and the target language for translation is ${userSettings.targetLanguage}.\n\nPREVIOUS STORY:\n${storyContext}\n\nPLAYER'S CHOICE: "${choice.choice}"`;

        const adventureStep = await generateAdventureStep(nextPrompt, userSettings, characterProfiles);

        if (!adventureStep || adventureStep === 'RPC_ERROR') {
            setError("Failed to generate the next chapter. Please try a different choice.");
            setLoadingState(LoadingState.ERROR);
            return;
        }
        
        updateCharacterProfiles(adventureStep.characters);
        
        let imageId = gameState?.imageId || '';
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
        
        const newHistory = [...history.slice(0, currentStepIndex + 1), { ...newHistoryStep, imageUrl: '' }];
        
        await db.transaction('rw', db.history, db.session, async () => {
            await db.history.where('id').above(currentStepIndex).delete(); // Clear old future branches
            await db.history.add(newHistoryStep);
            await db.session.update(SESSION_ID, { currentStepIndex: newHistory.length - 1 });
        });
        
        setHistory(newHistory);
        setCurrentStepIndex(newHistory.length - 1);
        setLoadingState(LoadingState.IDLE);
    };

    const handleGoBack = () => {
        if (currentStepIndex > 0) setCurrentStepIndex(prev => prev - 1);
    };
    const handleGoNext = () => {
        if (currentStepIndex < history.length - 1) setCurrentStepIndex(prev => prev + 1);
    };

    const handleSaveWord = async (item: VocabularyItem) => {
        const existing = notebook.find(i => i.word.toLowerCase() === item.word.toLowerCase());
        if (!existing) {
            const newItem: SavedVocabularyItem = {
                ...item,
                id: `${item.word}-${Date.now()}`,
                dateAdded: new Date().toISOString(),
                correctCount: 0,
                incorrectCount: 0,
            };
            await db.notebook.add(newItem);
            setNotebook(prev => [newItem, ...prev].sort((a,b) => new Date(b.dateAdded).getTime() - new Date(a.dateAdded).getTime()));
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
                    </>
                )}
            </div>
            {isImageFullscreen && currentImageUrl && (
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
                        src={currentImageUrl} 
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