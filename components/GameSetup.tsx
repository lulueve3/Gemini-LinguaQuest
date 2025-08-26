import React, { useState } from 'react';
import { UserSettings } from '../types';
import { generatePromptSuggestion } from '../services/geminiService';

interface GameSetupProps {
    onStartGame: (settings: UserSettings) => void;
    isLoading: boolean;
    onLoadGame: (file: File) => void;
    onContinueGame: () => void;
    hasSaveData: boolean;
    error: string | null;
    onClearCorruptedSave?: () => void;
}

const GameSetup: React.FC<GameSetupProps> = ({ 
    onStartGame, 
    isLoading, 
    onLoadGame, 
    onContinueGame, 
    hasSaveData, 
    error, 
    onClearCorruptedSave 
}) => {
    const [prompt, setPrompt] = useState('');
    const [genre, setGenre] = useState('Dark Fantasy');
    const [sourceLanguage, setSourceLanguage] = useState('English');
    const [targetLanguage, setTargetLanguage] = useState('Vietnamese');
    const [animeName, setAnimeName] = useState('');
    const [isSuggesting, setIsSuggesting] = useState(false);
    const [suggestionError, setSuggestionError] = useState<string | null>(null);
    const [generateImages, setGenerateImages] = useState(true);

    const handleSuggestPrompt = async () => {
        if (!animeName.trim()) {
            setSuggestionError("Please enter an anime or manga title.");
            return;
        }
        setIsSuggesting(true);
        setSuggestionError(null);

        const result = await generatePromptSuggestion(animeName);

        if (result) {
            const fullPrompt = `--- World Context ---
World: ${result.worldDescription}

Key Characters/Factions:
- ${result.keyCharacters.join('\n- ')}

Key Events:
- ${result.keyEvents.join('\n- ')}
--- End Context ---

Adventure Start:
${result.prompt}`;
            
            setPrompt(fullPrompt.trim());
            setGenre(result.genre);
        } else {
            setSuggestionError("Could not generate a suggestion. Please try a different title or write your own prompt.");
        }
        setIsSuggesting(false);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        if (!prompt.trim()) {
            alert('Please enter a story prompt.');
            return;
        }
        if (sourceLanguage.trim().toLowerCase() === targetLanguage.trim().toLowerCase()) {
            alert('Source and Target languages must be different.');
            return;
        }
        
        onStartGame({ 
            prompt: prompt, 
            genre, 
            sourceLanguage, 
            targetLanguage,
            animeStyle: animeName.trim() || undefined,
            generateImages,
        });
    };
    
    const handleLoadClick = () => {
        const fileInput = document.getElementById('loadGameInput');
        fileInput?.click();
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            onLoadGame(file);
        }
    };

    const isCorruptedSaveError = error && (
        error.includes('corrupted') || 
        error.includes('incompatible') || 
        error.includes('Invalid save')
    );

    return (
        <div className="min-h-screen bg-gray-900 text-gray-200 flex flex-col justify-center items-center p-4">
            <div className="w-full max-w-3xl text-center">
                 <header className="mb-8">
                    <h1 className="text-4xl md:text-5xl font-bold text-purple-300 tracking-wider">Gemini LinguaQuest</h1>
                    <p className="text-gray-400 mt-2">Your Language Learning RPG</p>
                </header>

                <div className="mb-8 p-6 bg-gray-800/30 border border-gray-700/50 rounded-lg text-left">
                    <h2 className="text-xl font-bold text-purple-300 mb-4 text-center">How It Works</h2>
                    <ul className="space-y-3 text-gray-300">
                        <li className="flex items-start gap-3">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-purple-400 mt-1 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
                            <span><strong>Create Your World:</strong> Write your own story prompt or get inspiration from your favorite anime/manga.</span>
                        </li>
                        <li className="flex items-start gap-3">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-purple-400 mt-1 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m12 8c0 5.523-4.477 10-10 10S5 18.523 5 13s4.477-10 10-10c.342 0 .678.024 1.007.07M7 13h2.5M15 13h2.5" /></svg>
                            <span><strong>Learn Through Story:</strong> Experience your adventure with a side-by-side translation, helping you learn in context.</span>
                        </li>
                        <li className="flex items-start gap-3">
                           <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-purple-400 mt-1 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v11.494m-9-5.494h18" /></svg>
                            <span><strong>Build Vocabulary:</strong> The AI identifies key words from the story. Save them to your personal notebook with one click.</span>
                        </li>
                        <li className="flex items-start gap-3">
                           <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-purple-400 mt-1 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                            <span><strong>Review & Master:</strong> Study your saved words anytime using the built-in flashcard system.</span>
                        </li>
                         <li className="flex items-start gap-3">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-purple-400 mt-1 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
                            <span><strong>Save & Load:</strong> Manually save your progress to a file and load it up anytime to continue your adventure.</span>
                        </li>
                    </ul>
                </div>

                <main className="bg-black bg-opacity-30 rounded-2xl shadow-2xl shadow-purple-900/20 p-6 md:p-8">
                    {error && (
                        <div className="bg-red-900/50 border border-red-500/50 text-red-300 p-3 rounded-lg mb-6 text-center">
                            <p>{error}</p>
                            {isCorruptedSaveError && onClearCorruptedSave && (
                                <button
                                    onClick={onClearCorruptedSave}
                                    className="mt-3 bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded transition-colors text-sm"
                                >
                                    Clear Corrupted Save Data
                                </button>
                            )}
                        </div>
                    )}
                    <form onSubmit={handleSubmit} className="space-y-6">
                        
                        <div>
                            <label className="block text-lg font-bold text-purple-300 mb-2">Need inspiration?</label>
                            <p className="text-sm text-gray-400 mb-3">Enter an anime/manga title to get a detailed story suggestion.</p>
                            <div className="flex flex-col sm:flex-row gap-3">
                                <input
                                    type="text"
                                    id="anime"
                                    value={animeName}
                                    onChange={(e) => setAnimeName(e.target.value)}
                                    placeholder="e.g., One Punch Man"
                                    className="w-full bg-gray-800/50 border border-gray-600/50 rounded-lg p-3 focus:ring-2 focus:ring-purple-400 focus:outline-none transition"
                                    disabled={isSuggesting || isLoading}
                                />
                                <button
                                    type="button"
                                    onClick={handleSuggestPrompt}
                                    disabled={isSuggesting || isLoading || !animeName.trim()}
                                    className="sm:w-auto bg-gray-600 hover:bg-gray-500 text-white font-bold py-3 px-4 rounded-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
                                >
                                    {isSuggesting ? 'Generating...' : 'Suggest'}
                                </button>
                            </div>
                            {suggestionError && <p className="text-red-300 mt-2 text-left">{suggestionError}</p>}
                        </div>

                        <div className="w-full border-t border-gray-700/50 my-2"></div>

                        <div>
                            <label htmlFor="prompt" className="block text-lg font-bold text-purple-300 mb-2">Adventure Prompt</label>
                            <textarea
                                id="prompt"
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                placeholder="e.g., A sci-fi mystery on a derelict space station."
                                className="w-full h-48 bg-gray-800/50 border border-gray-600/50 rounded-lg p-3 focus:ring-2 focus:ring-purple-400 focus:outline-none transition"
                                required
                            />
                        </div>
                        <div>
                            <label htmlFor="genre" className="block text-lg font-bold text-purple-300 mb-2">Genre</label>
                            <input
                                type="text"
                                id="genre"
                                value={genre}
                                onChange={(e) => setGenre(e.target.value)}
                                className="w-full bg-gray-800/50 border border-gray-600/50 rounded-lg p-3 focus:ring-2 focus:ring-purple-400 focus:outline-none transition"
                                required
                            />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                             <div>
                                <label htmlFor="sourceLang" className="block text-lg font-bold text-purple-300 mb-2">Story Language</label>
                                <input type="text" id="sourceLang" value={sourceLanguage} onChange={e => setSourceLanguage(e.target.value)} className="w-full bg-gray-800/50 border border-gray-600/50 rounded-lg p-3 focus:ring-2 focus:ring-purple-400 focus:outline-none transition" required />
                            </div>
                            <div>
                                <label htmlFor="targetLang" className="block text-lg font-bold text-purple-300 mb-2">Translate to</label>
                                <input type="text" id="targetLang" value={targetLanguage} onChange={e => setTargetLanguage(e.target.value)} className="w-full bg-gray-800/50 border border-gray-600/50 rounded-lg p-3 focus:ring-2 focus:ring-purple-400 focus:outline-none transition" required />
                            </div>
                        </div>

                        <div className="pt-2 text-left">
                            <label className="flex items-center gap-3 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={generateImages}
                                    onChange={(e) => setGenerateImages(e.target.checked)}
                                    className="h-5 w-5 rounded bg-gray-700 border-gray-600 text-purple-600 focus:ring-purple-500"
                                />
                                <span className="text-gray-300">Generate images for the story</span>
                            </label>
                            <p className="text-xs text-gray-500 ml-8">Disabling this can avoid image generation errors if you encounter API limits.</p>
                        </div>
                        
                        <input
                            type="file"
                            id="loadGameInput"
                            className="hidden"
                            accept=".json,application/json"
                            onChange={handleFileChange}
                        />

                        <div className="space-y-3 pt-2">
                            {hasSaveData && (
                                <button
                                    type="button"
                                    onClick={onContinueGame}
                                    disabled={isLoading || isSuggesting}
                                    className="w-full bg-green-600 hover:bg-green-700 text-white font-bold text-xl py-3 px-4 rounded-lg transition-all duration-300 disabled:opacity-50"
                                >
                                    Continue Last Adventure
                                </button>
                             )}
                             <button
                                type="button"
                                onClick={handleLoadClick}
                                disabled={isLoading || isSuggesting}
                                className="w-full bg-gray-600 hover:bg-gray-500 text-white font-bold text-xl py-3 px-4 rounded-lg transition-all duration-300 disabled:opacity-50"
                            >
                                Load Game from File
                            </button>
                            <button
                                type="submit"
                                disabled={isLoading || isSuggesting}
                                className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold text-lg py-3 px-4 rounded-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-105"
                            >
                                {isLoading ? 'Summoning...' : 'Start New Adventure'}
                            </button>
                        </div>
                    </form>
                </main>
            </div>
        </div>
    );
};

export default GameSetup;