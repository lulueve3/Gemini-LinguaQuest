

import React, { useState, useEffect, useCallback } from 'react';
import { LoadingState, GameState, AppScreen, UserSettings, VocabularyItem, SavedVocabularyItem, SaveData, ChoiceItem, CharacterProfile } from './types';
import { generateAdventureStep, generateAdventureImage } from './services/geminiService';
import ChoiceButton from './components/ChoiceButton';
import LoadingSpinner from './components/LoadingSpinner';
import GameSetup from './components/GameSetup';
import NotebookView from './components/NotebookView';

const NOTEBOOK_KEY = 'geminiAdventureNotebook';
const SAVE_GAME_KEY = 'geminiAdventureSave';


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

    const gameState = history[currentStepIndex] ?? null;

    // Load notebook and check for saved game on initial mount
    useEffect(() => {
        try {
            const savedNotebook = localStorage.getItem(NOTEBOOK_KEY);
            if (savedNotebook) {
                const parsedNotebook = JSON.parse(savedNotebook) as SavedVocabularyItem[];
                // Ensure backward compatibility with old saves
                const sanitizedNotebook = parsedNotebook.map(item => ({
                    ...item,
                    correctCount: item.correctCount || 0,
                    incorrectCount: item.incorrectCount || 0,
                }));
                setNotebook(sanitizedNotebook);
            }
            const savedGame = localStorage.getItem(SAVE_GAME_KEY);
            if (savedGame) {
                setHasSaveData(true);
            }
        } catch (e) {
            console.error("Failed to load data from localStorage", e);
        }
    }, []);
    
    // Save notebook whenever it changes
    useEffect(() => {
        try {
            localStorage.setItem(NOTEBOOK_KEY, JSON.stringify(notebook));
        } catch (e) {
            console.error("Failed to save notebook to localStorage", e);
        }
    }, [notebook]);

    const saveGameToLocalStorage = useCallback(() => {
        if (userSettings && history.length > 0) {
            const saveData: SaveData = { userSettings, history, currentStepIndex, characterProfiles };
            localStorage.setItem(SAVE_GAME_KEY, JSON.stringify(saveData));
            setHasSaveData(true);
        }
    }, [userSettings, history, currentStepIndex, characterProfiles]);
    
    useEffect(() => {
        // Auto-save on state change
        saveGameToLocalStorage();
    }, [saveGameToLocalStorage]);

    const handleManualSave = () => {
        // First, save to local storage for the continue button
        saveGameToLocalStorage();
        setShowSaveConfirmation(true);
        setTimeout(() => {
            setShowSaveConfirmation(false);
        }, 3000);

        // Then, trigger download
        if (userSettings && history.length > 0) {
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
        }
    };
    

    const handleContinueGame = useCallback(() => {
        try {
            const savedGame = localStorage.getItem(SAVE_GAME_KEY);
            if (!savedGame) {
                setError("No saved game found.");
                return;
            }
            const data = JSON.parse(savedGame) as SaveData;
            if (data.userSettings && data.history && data.history.length > 0 && typeof data.currentStepIndex === 'number') {
                const loadedUserSettings = {
                    ...data.userSettings,
                    generateImages: data.userSettings.generateImages ?? true,
                };
                setUserSettings(loadedUserSettings);
                setHistory(data.history);
                setCurrentStepIndex(data.currentStepIndex);
                setCharacterProfiles(data.characterProfiles || []);
                setAppScreen(AppScreen.GAME);
                setError(null);
                setLoadingState(LoadingState.IDLE);
            } else {
                throw new Error("Invalid save data format.");
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Could not load game.';
            console.error("Failed to load game from localStorage", err);
            setError(`Failed to load save file. ${message}`);
            localStorage.removeItem(SAVE_GAME_KEY);
            setHasSaveData(false);
        }
    }, []);

    const handleLoadGameFromFile = (file: File) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const text = e.target?.result as string;
                if (!text) {
                    throw new Error("File is empty.");
                }
                const data = JSON.parse(text) as SaveData;
                if (data.userSettings && data.history && data.history.length > 0 && typeof data.currentStepIndex === 'number') {
                     const loadedUserSettings = {
                        ...data.userSettings,
                        generateImages: data.userSettings.generateImages ?? true,
                    };
                    setUserSettings(loadedUserSettings);
                    setHistory(data.history);
                    setCurrentStepIndex(data.currentStepIndex);
                    setCharacterProfiles(data.characterProfiles || []);
                    setAppScreen(AppScreen.GAME);
                    setError(null);
                    setLoadingState(LoadingState.IDLE);
                } else {
                    throw new Error("Invalid save data format.");
                }
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Could not load game from file.';
                console.error("Failed to load game from file", err);
                setError(`Failed to load save file. ${message}`);
            }
        };
        reader.onerror = () => {
             setError(`Failed to read file. ${reader.error?.message ?? 'Unknown error'}`);
        };
        reader.readAsText(file);
    };
    
    const updateCharacterProfiles = (newProfiles: CharacterProfile[]) => {
        if (!newProfiles || newProfiles.length === 0) return;
        
        setCharacterProfiles(prevProfiles => {
            const profilesMap = new Map(prevProfiles.map(p => [p.name.toLowerCase(), p]));
            newProfiles.forEach(newProfile => {
                profilesMap.set(newProfile.name.toLowerCase(), newProfile);
            });
            return Array.from(profilesMap.values());
        });
    };


    const getLoadingMessage = () => {
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
        if (!notebook.some(savedItem => savedItem.word.toLowerCase() === item.word.toLowerCase() && savedItem.translation.toLowerCase() === item.translation.toLowerCase())) {
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
    };
    
    const handleToggleImageGeneration = () => {
        setUserSettings(prevSettings => {
            if (!prevSettings) return null;
            return { ...prevSettings, generateImages: !prevSettings.generateImages };
        });
    };
    
    const isLoading = loadingState !== LoadingState.IDLE && loadingState !== LoadingState.ERROR;
    const isAtLatestStep = currentStepIndex === history.length - 1;

    if (appScreen === AppScreen.SETUP) {
        return <GameSetup 
            onStartGame={handleStartGame} 
            isLoading={isLoading} 
            onContinueGame={handleContinueGame}
            hasSaveData={hasSaveData}
            error={error} 
            onLoadGame={handleLoadGameFromFile}
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
                    </div>
                    <div className="flex items-center flex-wrap gap-2">
                        <button onClick={handleGoBack} disabled={currentStepIndex <= 0 || isLoading} className="bg-gray-800/70 hover:bg-gray-700/90 text-purple-300 font-semibold py-2 px-4 border border-gray-600/80 rounded-lg shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed">Go Back</button>
                        <button onClick={handleGoNext} disabled={isAtLatestStep || isLoading} className="bg-gray-800/70 hover:bg-gray-700/90 text-purple-300 font-semibold py-2 px-4 border border-gray-600/80 rounded-lg shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed">Go Next</button>
                        <button onClick={handleManualSave} disabled={isLoading} className="bg-gray-800/70 hover:bg-gray-700/90 text-purple-300 font-semibold py-2 px-4 border border-gray-600/80 rounded-lg shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed">Save Game</button>
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
                        <div className="relative w-full h-64 lg:h-80 bg-gray-800">
                            {(loadingState !== LoadingState.IDLE || error || !gameState?.imageUrl || !userSettings?.generateImages) && (
                                <div className="absolute inset-0 bg-gray-900/80 backdrop-blur-sm flex flex-col justify-center items-center z-10 p-4 text-center">
                                    {isLoading && <LoadingSpinner />}
                                    <p className="mt-4 text-gray-400">{getLoadingMessage()}</p>
                                    {error && <p className="mt-2 text-red-400">{error}</p>}
                                    {(!userSettings?.generateImages && !isLoading) && <p className="mt-2 text-gray-500">Image generation is disabled.</p>}
                                    {error && <button onClick={handleReturnToMenu} className="mt-4 bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded transition-colors">Return to Menu</button>}
                                </div>
                            )}
                            {gameState?.imageUrl && <img src={gameState.imageUrl} alt="Adventure Scene" className={`w-full h-full object-cover transition-opacity duration-1000 ${isLoading || !userSettings?.generateImages ? 'opacity-30' : 'opacity-100'}`} />}
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
        </div>
    );
};

export default App;