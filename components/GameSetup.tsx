import React, { useState, useEffect, useCallback } from "react";
import { UserSettings, GameTag } from "../types";
import { buildCharacterSchema } from "../services/worldSchema";
import {
  generatePromptSuggestion,
  generateInspirationIdeas,
} from "../services/geminiService";

interface GameSetupProps {
  onStartGame: (settings: UserSettings) => void;
  isLoading: boolean;
  onLoadGame: (file: File) => void;
  onContinueGame: () => void;
  hasSaveData: boolean;
  error: string | null;
  onClearData?: () => void;
  onToast: (message: string, type?: "error" | "success") => void;
  onManageApiKeys: () => void;
}

const GameSetup: React.FC<GameSetupProps> = ({
  onStartGame,
  isLoading,
  onLoadGame,
  onContinueGame,
  hasSaveData,
  error,
  onClearData,
  onToast,
  onManageApiKeys,
}) => {
  const [prompt, setPrompt] = useState("");
  const [genre, setGenre] = useState("Dark Fantasy");
  const [sourceLanguage, setSourceLanguage] = useState("English");
  const [targetLanguage, setTargetLanguage] = useState("Vietnamese");
  const [animeName, setAnimeName] = useState("");
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [generateImages, setGenerateImages] = useState(false);
  const [imageModel, setImageModel] = useState(
    "gemini-2.5-flash-image-preview"
  );

  const [inspirationIdeas, setInspirationIdeas] = useState<string[]>([]);
  const [isLoadingInspirations, setIsLoadingInspirations] = useState(false);
  const [tags, setTags] = useState<GameTag[]>([]);
  const [tagsTouched, setTagsTouched] = useState(false);

  const inferTags = useCallback((g: string, p: string): GameTag[] => {
    const txt = `${g} ${p}`.toLowerCase();
    const out = new Set<GameTag>();
    const addIf = (cond: boolean, tag: GameTag) => { if (cond) out.add(tag); };
    addIf(/\bromance\b|\blove\b|dating/.test(txt), GameTag.Romance);
    addIf(/\bharem\b/.test(txt), GameTag.Harem);
    addIf(/magic|mage|wizard|spell|mana|arcane/.test(txt), GameTag.Magic);
    addIf(/sci[- ]?fi|mech|space|galaxy|cyberpunk|robot|android|\bai\b/.test(txt), GameTag.SciFi);
    addIf(/school|academy|high\s*school|campus/.test(txt), GameTag.SchoolLife);
    addIf(/combat|battle|fight|war|arena|slayer|hunter/.test(txt), GameTag.Combat);
    return Array.from(out);
  }, []);

  useEffect(() => {
    if (tagsTouched) return; // respect manual edits
    const suggested = inferTags(genre, prompt);
    setTags(suggested);
  }, [genre, prompt, tagsTouched, inferTags]);

  const fetchInspirations = useCallback(async () => {
    setIsLoadingInspirations(true);
    try {
      const ideas = await generateInspirationIdeas();
      setInspirationIdeas(ideas);
    } catch (e) {
      onToast((e as Error).message, "error");
      setInspirationIdeas([
        "Cyberpunk city run by AI",
        "Isekai adventure as a magical chef",
        "Vampire detective in neo-noir Tokyo",
        "Post-apocalyptic survival with giant mechs",
        "High school romance with time travel",
        "Space opera with warring galactic empires",
        "Fantasy quest to slay a dragon",
        "Modern-day monster hunting agency",
      ]); // Fallback ideas
    } finally {
      setIsLoadingInspirations(false);
    }
  }, [onToast]);

  // Do not auto-fetch inspirations on load; only fetch when user clicks

  const handleSuggestPrompt = async (inspiration?: string) => {
    const idea = (inspiration || animeName).trim();
    if (!idea) {
      onToast("Please enter an anime, manga title, or genre.", "error");
      return;
    }
    setIsSuggesting(true);
    setAnimeName(idea);

    try {
      const result = await generatePromptSuggestion(idea);
      const fullPrompt = `--- World Context ---
World: ${result.worldDescription}

Rules and Systems:
- ${(result.rulesAndSystems || []).join("\n- ")}

Faction and Roles:
- ${(result.charactersAndRoles || result.keyCharacters).join("\n- ")}

Plot and Conflict:
- ${(result.plotAndConflict || result.keyEvents).join("\n- ")}

Key Characters:
- ${result.keyCharacters.join("\n- ")}

Key Events:
- ${result.keyEvents.join("\n- ")}

--- Player Character ---
Role: ${result.playerRole}
Background: ${result.playerBackground}
Appearance: ${result.playerAppearance}
Personality: ${result.playerPersonality}
Skills: ${result.playerSkills.join(", ")}
Equipment: ${result.playerEquipment.join(", ")}
Starting Situation: ${result.startingSituation}
--- End Context ---

Adventure Start:
${result.prompt}`;

      setPrompt(fullPrompt.trim());
      setGenre(result.genre);
    } catch (e) {
      onToast((e as Error).message, "error");
    } finally {
      setIsSuggesting(false);
    }
  };

  const handleInspirationClick = (idea: string) => {
    handleSuggestPrompt(idea);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!prompt.trim()) {
      onToast("Please enter a story prompt.", "error");
      return;
    }
    if (!sourceLanguage.trim() || !targetLanguage.trim()) {
      onToast("Please enter both source and target languages.", "error");
      return;
    }
    if (
      sourceLanguage.trim().toLowerCase() ===
      targetLanguage.trim().toLowerCase()
    ) {
      onToast("Source and Target languages must be different.", "error");
      return;
    }

    onStartGame({
      prompt: prompt,
      genre,
      sourceLanguage,
      targetLanguage,
      animeStyle: animeName.trim() || undefined,
      generateImages,
      imageModel: generateImages ? imageModel : undefined,
      tags: tags.length ? tags : undefined,
    });
  };

  const handleLoadClick = () => {
    const fileInput = document.getElementById("loadGameInput");
    fileInput?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onLoadGame(file);
    }
  };

  const isCorruptedSaveError =
    error &&
    (error.includes("corrupted") ||
      error.includes("incompatible") ||
      error.includes("Invalid save") ||
      error.includes("Failed to load"));

  return (
    <div className="min-h-screen bg-gray-900 text-gray-200 flex flex-col p-4">
      <div className="flex-grow flex flex-col justify-center items-center">
        <div className="w-full max-w-3xl text-center">
          <header className="mb-8">
            <h1 className="text-4xl md:text-5xl font-bold text-purple-300 tracking-wider">
              Gemini LinguaQuest
            </h1>
            <p className="text-gray-400 mt-2">Your Language Learning RPG</p>
          </header>

          <div className="mb-8 p-6 bg-gray-800/30 border border-gray-700/50 rounded-lg text-left">
            <h2 className="text-xl font-bold text-purple-300 mb-4 text-center">
              How It Works
            </h2>
            <ul className="space-y-3 text-gray-300">
              <li className="flex items-start gap-3">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-6 w-6 text-purple-400 mt-1 flex-shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                  />
                </svg>
                <span>
                  <strong>Create Your World:</strong> Write a prompt for any
                  story you can imagine, or get AI-powered suggestions based on
                  your favorite anime or genre.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-6 w-6 text-purple-400 mt-1 flex-shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h2.184a2.173 2.173 0 002.062-2.173L15 6.42a2.173 2.173 0 00-2.16-2.173H12M5 12h5"
                  />
                </svg>
                <span>
                  <strong>Bilingual Storytelling:</strong> The AI generates the
                  story in your chosen language, side-by-side with a
                  translation, helping you learn in context.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-6 w-6 text-purple-400 mt-1 flex-shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                  />
                </svg>
                <span>
                  <strong>Make Choices & Learn:</strong> Your decisions shape
                  the story. Click on any word to translate it, and save new
                  vocabulary to your personal notebook.
                </span>
              </li>
            </ul>
          </div>

          {/* World Tags */}
          <div className="mb-6 p-4 bg-gray-800/30 border border-gray-700/50 rounded-lg text-left">
            <h3 className="text-lg font-semibold text-purple-300 mb-2">World Tags (optional)</h3>
            <p className="text-sm text-gray-400 mb-3">Select tags to customize status and systems. Hover cards to learn what stats each tag adds.</p>

            {/* Tag cards with descriptions */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {([
                { key: GameTag.Fantasy, label: 'Fantasy', desc: 'Swords, sorcery, and heroic quests.', adds: ['Health', 'Stamina', 'Mana', 'Morale'] },
                { key: GameTag.SciFi, label: 'Sci-Fi', desc: 'Hi-tech gear, space travel, energy systems.', adds: ['Health', 'Stamina', 'Energy', 'Morale'] },
                { key: GameTag.Romance, label: 'Romance', desc: 'Focus on relationships and social interactions.', adds: ['Charm', 'Heart', 'Social'] },
                { key: GameTag.SchoolLife, label: 'School Life', desc: 'Campus life, study, social and stress.', adds: ['Social', 'Grades', 'Stamina', 'Stress'] },
                { key: GameTag.Apocalypse, label: 'Apocalypse', desc: 'Harsh survival under extreme conditions.', adds: ['Health', 'Hunger', 'Thirst'] },
                { key: GameTag.Combat, label: 'Combat', desc: 'Battle-heavy world and fighting progression.', adds: ['Health', 'Stamina', 'Energy', 'Weapon Proficiency'] },
                { key: GameTag.Adventure, label: 'Adventure', desc: 'Exploration-focused, classic adventure pacing.', adds: ['Health', 'Stamina'] },
                { key: GameTag.Magic, label: 'Magic', desc: 'Add magical resource to any world.', adds: ['Mana'] },
                { key: GameTag.Harem, label: 'Harem', desc: 'Multiple romance routes and dynamics.', adds: ['Charm', 'Social'] },
              ] as const).map(({ key, label, desc, adds }) => (
                <label
                  key={key}
                  className={`group relative border rounded-md p-3 cursor-pointer transition-colors ${
                    tags.includes(key)
                      ? 'border-purple-600 bg-purple-900/10'
                      : 'border-gray-700 bg-gray-800/40 hover:bg-gray-800'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      className="form-checkbox h-4 w-4 text-purple-600 mt-1"
                      checked={tags.includes(key)}
                      onChange={(e) => {
                        setTagsTouched(true);
                        setTags((prev) =>
                          e.target.checked ? [...prev, key] : prev.filter((t) => t !== key)
                        );
                      }}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div>
                      <div className="text-sm font-semibold text-gray-200">{label}</div>
                      <div className="text-xs text-gray-400">{desc}</div>
                      <div className="mt-1 text-xs text-gray-300">
                        Adds: <span className="text-gray-200">{adds.join(', ')}</span>
                      </div>
                    </div>
                  </div>
                </label>
              ))}
            </div>

            {/* Live stats preview based on selected tags */}
            <div className="mt-4">
              <div className="text-sm font-semibold text-gray-300 mb-1">Stats Preview</div>
              <div className="flex flex-wrap gap-2">
                {buildCharacterSchema(tags).map((f) => (
                  <span key={f.key} className="text-xs px-2 py-1 rounded border border-gray-700 bg-gray-800/60 text-gray-200">
                    {f.label}
                  </span>
                ))}
                {buildCharacterSchema(tags).length === 0 && (
                  <span className="text-xs text-gray-500">No stats selected</span>
                )}
              </div>
              <div className="mt-1 text-xs text-gray-500">No default stats. Select tags to add stats.</div>
            </div>
          </div>

          <form
            onSubmit={handleSubmit}
            className="space-y-6 bg-gray-800/30 border border-gray-700/50 rounded-lg p-6 text-left"
          >
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-purple-300 mb-2 text-center">
                Create a New Adventure
              </h2>

              <div className="p-4 bg-gray-900/40 rounded-lg border border-gray-700/50">
                <h3 className="text-lg font-semibold text-gray-300 mb-2">
                  Need inspiration?
                </h3>
                <p className="text-sm text-gray-400 mb-3">
                  Enter an anime, manga title, or genre to get a detailed story
                  suggestion. Or click one of the ideas below!
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={animeName}
                    onChange={(e) => setAnimeName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleSuggestPrompt();
                      }
                    }}
                    placeholder="e.g., Attack on Titan, sci-fi, isekai"
                    className="flex-grow bg-gray-800 border border-gray-600 rounded-md py-2 px-3 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                  <button
                    type="button"
                    onClick={() => handleSuggestPrompt()}
                    disabled={isSuggesting}
                    className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-md transition-colors disabled:opacity-50"
                  >
                    {isSuggesting ? "Thinking..." : "Suggest"}
                  </button>
                </div>
                <div className="mt-4">
                  {isLoadingInspirations ? (
                    <p className="text-gray-500 text-sm">
                      Generating fresh ideas...
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                      {inspirationIdeas.map((idea) => (
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
                    className={`mt-3 mx-auto flex items-center gap-2 px-4 py-2 rounded-lg font-extrabold shadow-lg transition-all duration-200 ${
                      isLoadingInspirations
                        ? "opacity-60 cursor-not-allowed bg-gradient-to-r from-yellow-400 via-pink-500 to-purple-600 text-black"
                        : "bg-gradient-to-r from-yellow-400 via-pink-500 to-purple-600 text-black hover:brightness-110"
                    }`}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className={`h-5 w-5 ${isLoadingInspirations ? "animate-spin" : ""}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 4v5h.582M20 20v-5h-.581M5 9a7 7 0 0114 0M19 15a7 7 0 01-14 0"
                      />
                    </svg>
                    {isLoadingInspirations ? "Loading Ideas..." : "Need Ideas"}
                  </button>
                </div>
              </div>

              <div>
                <label
                  htmlFor="prompt"
                  className="block text-lg font-semibold text-gray-300 mb-2"
                >
                  Your Story Prompt
                </label>
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
                  <label
                    htmlFor="genre"
                    className="block text-sm font-medium text-gray-400 mb-1"
                  >
                    Story Genre
                  </label>
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
                    <label
                      htmlFor="sourceLanguage"
                      className="block text-sm font-medium text-gray-400 mb-1"
                    >
                      Source Language
                    </label>
                    <input
                      type="text"
                      id="sourceLanguage"
                      value={sourceLanguage}
                      onChange={(e) => setSourceLanguage(e.target.value)}
                      placeholder="e.g., English"
                      className="w-full bg-gray-800 border border-gray-600 rounded-md py-2 px-3 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="targetLanguage"
                      className="block text-sm font-medium text-gray-400 mb-1"
                    >
                      Translate Language
                    </label>
                    <input
                      type="text"
                      id="targetLanguage"
                      value={targetLanguage}
                      onChange={(e) => setTargetLanguage(e.target.value)}
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
                <label htmlFor="generateImages" className="text-gray-300">
                  Generate images for each story step (requires more API usage)
                </label>
              </div>

              {generateImages && (
                <div className="pt-2">
                  <label
                    htmlFor="imageModel"
                    className="block text-sm font-medium text-gray-400 mb-1"
                  >
                    Image Model
                  </label>
                  <select
                    id="imageModel"
                    value={imageModel}
                    onChange={(e) => setImageModel(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-600 rounded-md py-2 px-3 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    {/* Google (Gemini/Imagen) */}
                    <option value="gemini-2.5-flash-image-preview">gemini-2.5-flash-image-preview</option>
                    <option value="imagen-3.0-generate-002">imagen-3.0-generate-002</option>
                    <option value="imagen-4.0-generate-001">imagen-4.0-generate-001</option>
                    {/* ImageFX */}
                    <option value="imagefx-api">imagefx-api</option>
                    {/* DeepAI */}
                    <option value="deepai-text2img">deepai-text2img</option>
                    {/* KlingAI */}
                    <option value="kling-v2-1">kling-v2-1</option>
                  </select>
                </div>
              )}
            </div>

            <div>
              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:bg-gray-600"
              >
                {isLoading ? "Embarking..." : "Start New Adventure"}
              </button>
            </div>
          </form>

          <div className="mt-8 text-center">
            <div className="relative my-4">
              <div
                className="absolute inset-0 flex items-center"
                aria-hidden="true"
              >
                <div className="w-full border-t border-gray-700"></div>
              </div>
              <div className="relative flex justify-center">
                <span className="bg-gray-900 px-2 text-sm text-gray-500">
                  Or
                </span>
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
                className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-3 px-6 rounded-lg transition-colors w-full sm:w-auto disabled:opacity-50"
              >
                Load from File
              </button>
              <button
                type="button"
                onClick={onManageApiKeys}
                disabled={isLoading}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg transition-colors w-full sm:w-auto disabled:opacity-50"
              >
                Manage API Keys
              </button>
              <input
                type="file"
                id="loadGameInput"
                className="hidden"
                accept=".json"
                onChange={handleFileChange}
              />
            </div>
            {isCorruptedSaveError && onClearData && (
              <div className="mt-4 text-center text-sm text-red-300 bg-red-900/40 p-3 rounded-lg border border-red-700/60 max-w-md mx-auto">
                <p className="mb-2">
                  Your saved game data appears to be corrupted or incompatible.
                </p>
                <button
                  onClick={onClearData}
                  className="underline hover:text-white"
                >
                  Click here to clear the corrupted data and start fresh.
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default GameSetup;
