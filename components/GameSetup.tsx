import React, { useState, useEffect, useCallback } from 'react';
import { UserSettings } from '../types';
import { generatePromptSuggestion, generateInspirationIdeas } from '../services/geminiService';

interface GameSetupProps {
    onStartGame: (settings: UserSettings) => void;
    isLoading: boolean;
    onLoadGame: (file: File) => void;
    onContinueGame: () => void;
    hasSaveData: boolean;
    error: string | null;
    successMessage?: string | null;
    onClearData?: () => void;
}

const GameSetup: React.FC<GameSetupProps> = ({ 
    onStartGame, 
    isLoading, 
    onLoadGame, 
    onContinueGame, 
    hasSaveData, 
    error,
    successMessage,
    onClearData 
}) => {
    const [prompt, setPrompt] = useState('');
    const [genre, setGenre] = useState('Dark Fantasy');
    const [sourceLanguage, setSourceLanguage] = useState('English');
    const [targetLanguage, setTargetLanguage] = useState('Vietnamese');
    const [animeName, setAnimeName] = useState('');
    const [isSuggesting, setIsSuggesting] = useState(false);
    const [suggestionError, setSuggestionError] = useState<string | null>(null);
    const [generateImages, setGenerateImages] = useState(true);

    const [inspirationIdeas, setInspirationIdeas] = useState<string[]>([]);
    const [isLoadingInspirations, setIsLoadingInspirations] = useState(true);

    const fetchInspirations = useCallback(async () => {
        setIsLoadingInspirations(true);
        const ideas = await generateInspirationIdeas();
        if (ideas) {
            setInspirationIdeas(ideas);
        } else {
            setInspirationIdeas([
                'Cyberpunk city run by AI', 'Isekai adventure as a magical chef', 'Vampire detective in neo-noir Tokyo',
                'Post-apocalyptic survival with giant mechs', 'High school romance with time travel', 'Space opera with warring galactic empires',
                'Fantasy quest to slay a dragon', 'Modern-day monster hunting agency'
            ]); // Fallback ideas
        }
        setIsLoadingInspirations(false);
    }, []);

    useEffect(() => {
        fetchInspirations();
    }, [fetchInspirations]);

    const handleSuggestPrompt = async (inspiration?: string) => {
        const idea = (inspiration || animeName).trim();
        if (!idea) {
            setSuggestionError("Please enter an anime, manga title, or genre.");
            return;
        }
        setIsSuggesting(true);
        setSuggestionError(null);
        setAnimeName(idea);

        const result = await generatePromptSuggestion(idea);

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

    const handleInspirationClick = (idea: string) => {
        handleSuggestPrompt(idea);
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
        error.includes('Invalid save') ||
        error.includes('Failed to load')
    );
    
    return (
        <div className="min-h-screen bg-gray-900 text-gray-200 flex flex-col p-4">
            <div className="flex-grow flex flex-col justify-center items-center">
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
                                <span><strong>Create Your World:</strong> Write a prompt for any story you can imagine, or get AI-powered suggestions based on your favorite anime or genre.</span>
                            </li>
                            <li className="flex items-start gap-3">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-purple-400 mt-1 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h2.184a2.173 2.173 0 002.062-2.173L15 6.42a2.173 2.173 0 00-2.16-2.173H12M5 12h5" /></svg>
                                <span><strong>Bilingual Storytelling:</strong> The AI generates the story in your chosen language, side-by-side with a translation, helping you learn in context.</span>
                            </li>
                             <li className="flex items-start gap-3">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-purple-400 mt-1 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
                                <span><strong>Make Choices & Learn:</strong> Your decisions shape the story. Click on any word to translate it, and save new vocabulary to your personal notebook.</span>
                            </li>
                        </ul>
                    </div>
                    
                    <form onSubmit={handleSubmit} className="space-y-6 bg-gray-800/30 border border-gray-700/50 rounded-lg p-6 text-left">
                        <div className="space-y-4">
                            <h2 className="text-xl font-bold text-purple-300 mb-2 text-center">Create a New Adventure</h2>
                            
                            <div className="p-4 bg-gray-900/40 rounded-lg border border-gray-700/50">
                                <h3 className="text-lg font-semibold text-gray-300 mb-2">Need inspiration?</h3>
                                <p className="text-sm text-gray-400 mb-3">Enter an anime, manga title, or genre to get a detailed story suggestion. Or click one of the ideas below!</p>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={animeName}
                                        onChange={(e) => setAnimeName(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSuggestPrompt(); }}}
                                        placeholder="e.g., Attack on Titan, sci-fi, isekai"
                                        className="flex-grow bg-gray-800 border border-gray-600 rounded-md py-2 px-3 focus:outline-none focus:ring-2 focus:ring-purple-500"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => handleSuggestPrompt()}
                                        disabled={isSuggesting}
                                        className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-md transition-colors disabled:opacity-50"
                                    >
                                        {isSuggesting ? 'Thinking...' : 'Suggest'}
                                    </button>
                                </div>
                                {suggestionError && <p className="text-red-400 text-sm mt-2">{suggestionError}</p>}
                                <div className="mt-4">
                                    {isLoadingInspirations ? (
                                        <p className="text-gray-500 text-sm">Generating fresh ideas...</p>
                                    ) : (
                                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                                            {inspirationIdeas.map(idea => (
                                                <button
                                                    key={idea}
                                                    type="button"
                                                    onClick={() => handleInspirationClick(idea)}
                                                    className="w-full text-center text-sm bg-gray-700/60 hover:bg-gray-700 border border-gray-600/80 rounded-md py-2 px-2 transition-colors duration-200"
                                                >
                                                    {idea}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                     <button
                                        type="button"
                                        onClick={fetchInspirations}
                                        disabled={isLoadingInspirations}
                                        className="text-gray-400 hover:text-white text-xs mt-3 flex items-center gap-1 mx-auto"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 ${isLoadingInspirations ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0011.664 0l3.181-3.183m-4.991-2.695v.001" /></svg>
                                        Refresh Ideas
                                    </button>
                                </div>
                            </div>
                            
                            <div>
                                <label htmlFor="prompt" className="block text-lg font-semibold text-gray-300 mb-2">Your Story Prompt</label>
                                <textarea
                                    id="prompt"
                                    value={prompt}
                                    onChange={(e) => setPrompt(e.target.value)}
                                    rows={6}
                                    placeholder="Describe the beginning of your adventure... e.g., 'You are a lone knight standing at the edge of a chasm, a glowing sword in hand.'"
                                    className="w-full bg-gray-800 border border-gray-600 rounded-md py-2 px-3 focus:outline-none focus:ring-2 focus:ring-purple-500"
                                ></textarea>
                            </div>

                            <div className="space-y-4 pt-2">
                                <div>
                                    <label htmlFor="genre" className="block text-sm font-medium text-gray-400 mb-1">Story Genre</label>
                                    <input
                                        type="text"
                                        id="genre"
                                        value={genre}
                                        onChange={(e) => setGenre(e.target.value)}
                                        className="w-full bg-gray-800 border border-gray-600 rounded-md py-2 px-3 focus:outline-none focus:ring-2 focus:ring-purple-500"
                                    />
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label htmlFor="sourceLanguage" className="block text-sm font-medium text-gray-400 mb-1">Source Language</label>
                                        <input
                                            type="text"
                                            id="sourceLanguage"
                                            value={sourceLanguage}
                                            onChange={e => setSourceLanguage(e.target.value)}
                                            placeholder="e.g., English"
                                            className="w-full bg-gray-800 border border-gray-600 rounded-md py-2 px-3 focus:outline-none focus:ring-2 focus:ring-purple-500"
                                        />
                                    </div>
                                    <div>
                                        <label htmlFor="targetLanguage" className="block text-sm font-medium text-gray-400 mb-1">Translate Language</label>
                                        <input
                                            type="text"
                                            id="targetLanguage"
                                            value={targetLanguage}
                                            onChange={e => setTargetLanguage(e.target.value)}
                                            placeholder="e.g., Vietnamese"
                                            className="w-full bg-gray-800 border border-gray-600 rounded-md py-2 px-3 focus:outline-none focus:ring-2 focus:ring-purple-500"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-3 pt-2">
                                <input
                                    type="checkbox"
                                    id="generateImages"
                                    checked={generateImages}
                                    onChange={(e) => setGenerateImages(e.target.checked)}
                                    className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                                />
                                <label htmlFor="generateImages" className="text-gray-300">Generate images for each story step (requires more API usage)</label>
                            </div>
                        </div>

                        <div>
                            <button 
                                type="submit"
                                disabled={isLoading}
                                className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:bg-gray-600"
                            >
                                {isLoading ? 'Embarking...' : 'Start New Adventure'}
                            </button>
                        </div>
                    </form>

                    <div className="mt-8 text-center">
                        <div className="relative my-4">
                            <div className="absolute inset-0 flex items-center" aria-hidden="true">
                                <div className="w-full border-t border-gray-700"></div>
                            </div>
                            <div className="relative flex justify-center">
                                <span className="bg-gray-900 px-2 text-sm text-gray-500">Or</span>
                            </div>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-4 justify-center">
                            <button
                                type="button"
                                onClick={onContinueGame}
                                disabled={!hasSaveData || isLoading}
                                className="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-lg transition-colors w-full sm:w-auto disabled:opacity-50 disabled:bg-gray-600 disabled:cursor-not-allowed"
                            >
                                Continue Adventure
                            </button>
                            <button
                                type="button"
                                onClick={handleLoadClick}
                                disabled={isLoading}
                                className="bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 px-6 rounded-lg transition-colors w-full sm:w-auto disabled:opacity-50"
                            >
                                Load from File
                            </button>
                        </div>
                    </div>

                     {error && (
                        <div className="mt-6 p-4 bg-red-900/50 border border-red-700/80 rounded-lg text-red-300">
                            <p className="font-bold">An Error Occurred</p>
                            <p className="text-sm">{error}</p>
                             {isCorruptedSaveError && onClearData && (
                                <button onClick={onClearData} className="mt-3 text-sm underline hover:text-white">Clear corrupted data and start fresh?</button>
                            )}
                        </div>
                    )}
                    {successMessage && (
                        <div className="mt-6 p-4 bg-green-900/50 border border-green-700/80 rounded-lg text-green-300">
                            <p>{successMessage}</p>
                        </div>
                    )}
                </div>
            </div>

            <footer className="text-center mt-8 pb-4">
                {onClearData && <button onClick={onClearData} className="text-xs text-gray-600 hover:text-gray-400 underline">Clear All Data</button>}
                <input type="file" id="loadGameInput" className="hidden" accept=".json" onChange={handleFileChange} />
            </footer>
        </div>
    );
};

export default GameSetup;