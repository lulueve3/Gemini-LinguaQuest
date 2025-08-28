
import { GoogleGenAI, Type } from "@google/genai";
import { AdventureStep, UserSettings, PromptSuggestion, CharacterProfile } from '../types';
import apiKeyService from './apiKeyService';

const getClient = () => {
    const key = apiKeyService.getActiveKey();
    if (!key) {
        throw new Error("No API key configured. Please add an API key.");
    }
    return new GoogleGenAI({ apiKey: key });
};

const storyModel = 'gemini-2.5-flash';
const ideasModel = 'gemini-2.0-flash-lite';
const imageModel = 'imagen-4.0-generate-001';

const characterSchema = {
    type: Type.OBJECT,
    properties: {
        name: { type: Type.STRING, description: "The name of the character or monster." },
        description: { type: Type.STRING, description: "A detailed physical description of the character or monster. This description will be used to maintain visual consistency in future images." }
    },
    required: ["name", "description"]
};

const vocabularySchema = {
    type: Type.OBJECT,
    properties: {
        word: { type: Type.STRING, description: "A key vocabulary word from the story in the source language." },
        translation: { type: Type.STRING, description: "The translation of the word in the target language." }
    },
    required: ["word", "translation"]
};

const choiceSchema = {
    type: Type.OBJECT,
    properties: {
        choice: { type: Type.STRING, description: "An actionable choice for the player in the source language." },
        translatedChoice: { type: Type.STRING, description: "The translation of the choice into the target language." }
    },
    required: ["choice", "translatedChoice"]
};

const equipmentSchema = {
    type: Type.OBJECT,
    properties: {
        name: { type: Type.STRING, description: "Name of the equipment item." },
        description: { type: Type.STRING, description: "Brief description or attributes of the item." },
        equipped: { type: Type.BOOLEAN, description: "Whether the item is currently equipped." }
    },
    required: ["name", "description", "equipped"]
};

const skillSchema = {
    type: Type.OBJECT,
    properties: {
        name: { type: Type.STRING, description: "Name of the skill." },
        level: { type: Type.INTEGER, description: "Current level or proficiency of the skill." },
        isActive: { type: Type.BOOLEAN, description: "Whether the skill is currently active or relevant." }
    },
    required: ["name", "level", "isActive"]
};

const responseSchema = {
    type: Type.OBJECT,
    properties: {
        story: {
            type: Type.STRING,
            description: "A paragraph of the story in the specified source language. It should be engaging and descriptive."
        },
        translatedStory: {
            type: Type.STRING,
            description: "An accurate and natural-sounding translation of the story paragraph into the target language."
        },
        imagePrompt: {
            type: Type.STRING,
            description: "A highly detailed and artistic prompt for an image generation model. Describe the scene, characters, mood, and style. If a specific anime/manga style is mentioned in the user's prompt or game settings, ensure the image prompt reflects that style (e.g., 'digital anime art in the style of Berserk, ...'). For example: 'Epic fantasy oil painting of a lone knight standing at the edge of a misty chasm, glowing sword in hand, cinematic lighting.'"
        },
        choices: {
            type: Type.ARRAY,
            items: choiceSchema,
            description: "An array of exactly 4 distinct, actionable choices for the player, each with a source language text and a target language translation.",
            minItems: 4,
            maxItems: 4,
        },
        vocabulary: {
            type: Type.ARRAY,
            items: vocabularySchema,
            description: "An array of 5-7 key vocabulary words from the story text that would be useful for a language learner. Provide the word in the source language and its translation in the target language."
        },
        characters: {
            type: Type.ARRAY,
            items: characterSchema,
            description: "An array describing any NEW characters or monsters introduced in this story segment. If an existing character's appearance changes significantly, include them here with the updated description. Do not include characters that are already known and unchanged."
        },
        summary: {
            type: Type.STRING,
            description: "A one or two sentence summary of the current step, highlighting key events to remember."
        },
        equipment: {
            type: Type.ARRAY,
            items: equipmentSchema,
            description: "The player's current equipment list after this step."
        },
        skills: {
            type: Type.ARRAY,
            items: skillSchema,
            description: "The player's current skills with levels and activation status."
        }
    },
    required: ["story", "translatedStory", "imagePrompt", "choices", "vocabulary", "characters", "summary", "equipment", "skills"]
};

const suggestionSchema = {
    type: Type.OBJECT,
    properties: {
        prompt: {
            type: Type.STRING,
            description: "A creative and engaging story prompt for a text-based RPG, based on the provided anime/manga. It should set a scene and present an initial situation for the player."
        },
        genre: {
            type: Type.STRING,
            description: "A suitable genre for the story, derived from the tone and themes of the anime/manga (e.g., 'Post-Apocalyptic', 'Dark Fantasy', 'Cyberpunk')."
        },
        worldDescription: {
            type: Type.STRING,
            description: "A detailed paragraph describing the world, its main characteristics, and setting, based on the anime/manga."
        },
        keyCharacters: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "A list of important characters or factions relevant to the prompt (any number)."
        },
        keyEvents: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "A list of significant past or ongoing events that set the stage for the story (any number)."
        },
        playerBackground: {
            type: Type.STRING,
            description: "A concise backstory for the player's character including origin, motivation, and current status."
        },
        playerRole: {
            type: Type.STRING,
            description: "The role/class/archetype the player embodies in this world."
        },
        playerSkills: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "A list of notable skills or abilities the player's character has (any number; can expand over time)."
        },
        startingSituation: {
            type: Type.STRING,
            description: "A concrete starting situation or hook describing where the player begins and immediate context or objective."
        },
        playerAppearance: {
            type: Type.STRING,
            description: "A short but vivid description of the player's character appearance (age, build, attire, notable features)."
        },
        playerPersonality: {
            type: Type.STRING,
            description: "A concise description of personality traits and demeanor influencing decisions and interactions."
        },
        playerEquipment: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "A list of starting equipment or items (any number; can expand as the player progresses)."
        }
    },
    required: [
        "prompt",
        "genre",
        "worldDescription",
        "keyCharacters",
        "keyEvents",
        "playerBackground",
        "playerRole",
        "playerSkills",
        "startingSituation",
        "playerAppearance",
        "playerPersonality",
        "playerEquipment"
    ]
};

const inspirationSchema = {
    type: Type.OBJECT,
    properties: {
        ideas: {
            type: Type.ARRAY,
            items: { type: Type.STRING, description: "A single, short, creative idea for a text-based RPG." },
            description: "An array of exactly 8 diverse and concise ideas for a text-based RPG, inspired by various anime/manga genres.",
            minItems: 8,
            maxItems: 8
        }
    },
    required: ["ideas"]
};


const systemInstruction = `You are a multilingual storyteller and language tutor creating a text-based adventure game. Your goal is to generate an immersive narrative that helps users learn a new language. 
You will be provided with a list of known characters and their descriptions. You MUST use these descriptions when generating the story and especially the image prompt to ensure visual consistency for all characters and monsters.
When you introduce new characters or monsters, or if their appearance changes, you must provide their descriptions in the 'characters' array of your response.
For each step, you must provide:
1. A compelling story segment in the user-specified source language.
2. An accurate translation of that segment into the target language.
3. A visually descriptive prompt for an image generation model that captures the scene. If a specific visual style (like an anime/manga) is requested, you MUST ensure the image prompt strongly incorporates and maintains that style. You MUST also use the provided character descriptions for consistency.
4. Exactly 4 distinct choices for the player, each with text in both the source and target languages.
5. A list of 5-7 useful vocabulary words from the story segment, with their translations.
6. A list of character profiles for any new or changed characters/monsters.
You must respond ONLY with a valid JSON object matching the provided schema. The story should be continuous and react to the player's choices and initial prompt.`;

const getApiErrorMessage = (error: unknown): string => {
    const defaultMessage = "An unknown API error occurred. Please check the console for details.";
    if (error instanceof Error) {
        const msg = error.message.toLowerCase();
        if (msg.includes("resource_exhausted") || msg.includes("429")) {
            return "API rate limit exceeded (RESOURCE_EXHAUSTED). Please wait a moment before trying again.";
        }
        if (msg.includes("api key not valid")) {
            return "The provided API key is invalid. Please ensure it is set correctly.";
        }
        if (msg.includes("500") || msg.includes("503")) {
            return "The AI service is temporarily unavailable (Server Error). Please try again later.";
        }
        if (msg.includes("rpc failed") || msg.includes("xhr error")) {
            return "A network error occurred while communicating with the AI. Please check your connection.";
        }
        if (msg.includes("candidate was blocked")) {
            return "The response was blocked by the safety filter. Please adjust your prompt.";
        }
        return error.message;
    }
    return String(error) || defaultMessage;
};

const isQuotaError = (error: unknown): boolean => {
    if (error instanceof Error) {
        const msg = error.message.toLowerCase();
        return msg.includes("resource_exhausted") || msg.includes("429");
    }
    const msg = String(error).toLowerCase();
    return msg.includes("resource_exhausted") || msg.includes("429");
};

const callGemini = async <T>(fn: (client: GoogleGenAI) => Promise<T>): Promise<T> => {
    const keys = apiKeyService.getKeys();
    if (keys.length === 0) {
        throw new Error("No API key configured. Please add an API key.");
    }
    for (let attempt = 0; attempt < keys.length; attempt++) {
        const client = getClient();
        try {
            return await fn(client);
        } catch (error) {
            if (isQuotaError(error) && attempt < keys.length - 1) {
                if (apiKeyService.switchToNextKey()) {
                    continue;
                }
            }
            throw new Error(getApiErrorMessage(error));
        }
    }
    throw new Error("All API keys are exhausted.");
};


export const generateAdventureStep = async (prompt: string, settings: Omit<UserSettings, 'prompt'>, knownCharacters: CharacterProfile[]): Promise<AdventureStep> => {
    try {
        const styleInstruction = settings.animeStyle ? `\nVisual Style to maintain: The anime/manga style of "${settings.animeStyle}".` : '';
        
        const characterContext = knownCharacters.length > 0 
            ? `\n\n--- Known Characters/Monsters (Maintain Consistency) ---\n${knownCharacters.map(c => `${c.name}: ${c.description}`).join('\n')}` 
            : '';

        const fullPrompt = `${prompt}${characterContext}\n\nGame settings:\nSource Language: ${settings.sourceLanguage}\nTarget Language: ${settings.targetLanguage}\nGenre: ${settings.genre}${styleInstruction}`;

        const response = await callGemini(client => client.models.generateContent({
            model: storyModel,
            contents: fullPrompt,
            config: {
                systemInstruction: systemInstruction,
                responseMimeType: "application/json",
                responseSchema: responseSchema,
                temperature: 0.8,
            },
        }));

        const jsonText = response.text.trim();
        const parsedJson = JSON.parse(jsonText);
        
        if (
            parsedJson.story &&
            parsedJson.translatedStory &&
            parsedJson.imagePrompt &&
            typeof parsedJson.summary === 'string' &&
            Array.isArray(parsedJson.choices) && parsedJson.choices.length === 4 &&
            Array.isArray(parsedJson.vocabulary) &&
            Array.isArray(parsedJson.characters) &&
            Array.isArray(parsedJson.equipment) &&
            Array.isArray(parsedJson.skills)
        ) {
            return parsedJson as AdventureStep;
        } else {
            console.error("Invalid JSON structure received from Gemini:", parsedJson);
            throw new Error("Received an invalid or incomplete data structure from the AI.");
        }

    } catch (error) {
        console.error("Error generating adventure step:", error);
        throw new Error(getApiErrorMessage(error));
    }
};

export const generatePromptSuggestion = async (animeName: string): Promise<PromptSuggestion> => {
    try {
        const fullPrompt = `Based on the anime/manga "${animeName}", generate a detailed suggestion for a text-based RPG.
Provide:
- A creative story prompt to kick off the adventure
- A suitable genre
- A richly detailed world description
- A list of key characters or factions (any number; concise)
- A list of key events that set context (any number)
- Player character details: role/class, concise background, skills (any number), appearance, personality, starting equipment (any number), and a concrete starting situation.`;

        const response = await callGemini(client => client.models.generateContent({
            model: storyModel,
            contents: fullPrompt,
            config: {
                systemInstruction: "You are a creative assistant helping a user brainstorm ideas for a role-playing game. You must respond ONLY with a valid JSON object that strictly matches the provided schema, including detailed player character fields.",
                responseMimeType: "application/json",
                responseSchema: suggestionSchema,
                temperature: 0.7,
            },
        }));

        const jsonText = response.text.trim();
        const parsedJson = JSON.parse(jsonText);
        
        if (
            parsedJson.prompt &&
            parsedJson.genre &&
            parsedJson.worldDescription &&
            Array.isArray(parsedJson.keyCharacters) &&
            Array.isArray(parsedJson.keyEvents) &&
            typeof parsedJson.playerBackground === 'string' &&
            typeof parsedJson.playerRole === 'string' &&
            Array.isArray(parsedJson.playerSkills) &&
            typeof parsedJson.startingSituation === 'string' &&
            typeof parsedJson.playerAppearance === 'string' &&
            typeof parsedJson.playerPersonality === 'string' &&
            Array.isArray(parsedJson.playerEquipment)
        ) {
            return parsedJson as PromptSuggestion;
        } else {
            console.error("Invalid JSON structure received for prompt suggestion:", parsedJson);
            throw new Error("Received an invalid data structure for the suggestion.");
        }

    } catch (error) {
        console.error("Error generating prompt suggestion:", error);
        throw new Error(getApiErrorMessage(error));
    }
};

export const generateInspirationIdeas = async (): Promise<string[]> => {
    try {
        const prompt = `Generate a list of exactly 8 diverse and creative ideas for a text-based RPG. The list MUST contain a specific mix of two types of ideas:
1. **4 ideas** based on popular but varied anime or manga series. Frame them as a unique role-playing scenario for the player. Each of these ideas MUST clearly state the name of the anime/manga it is based on. For example: 'Survive as a scout in Attack on Titan' or 'A rookie devil hunter in the world of Chainsaw Man'.
2. **4 ideas** that are completely original concepts based on genres (e.g., 'A bio-punk detective solving crimes in a city of mutated plants', 'A solar-punk pirate sailing the cosmic winds'). These should be creative and not reference any existing anime/manga.
Do not repeat the examples given. Each idea must be a short, punchy phrase suitable for a button label. Ensure high variety in the suggestions.`;
        
        const response = await callGemini(client => client.models.generateContent({
            model: ideasModel,
            contents: prompt,
            config: {
                systemInstruction: "You are a creative assistant that provides a JSON object containing a list of exactly 8 short RPG ideas. You must respond ONLY with a valid JSON object matching the provided schema.",
                responseMimeType: "application/json",
                responseSchema: inspirationSchema,
                temperature: 0.9,
            }
        }));

        const jsonText = response.text.trim();
        const parsedJson = JSON.parse(jsonText);

        if (Array.isArray(parsedJson.ideas) && parsedJson.ideas.length === 8) {
            return parsedJson.ideas as string[];
        } else {
            console.error("Invalid JSON structure for inspiration ideas:", parsedJson);
            throw new Error("Received invalid data for inspiration ideas.");
        }

    } catch (error) {
        console.error("Error generating inspiration ideas:", error);
        throw new Error(getApiErrorMessage(error));
    }
}


export const generateAdventureImage = async (prompt: string): Promise<Blob> => {
    try {
        const response = await callGemini(client => client.models.generateImages({
            model: imageModel,
            prompt: prompt,
            config: {
                numberOfImages: 1,
                outputMimeType: 'image/jpeg',
                aspectRatio: '16:9',
            },
        }));

        if (response.generatedImages && response.generatedImages.length > 0) {
            const base64ImageBytes: string = response.generatedImages[0].image.imageBytes;
            const byteCharacters = atob(base64ImageBytes);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            return new Blob([byteArray], { type: 'image/jpeg' });
        }
        throw new Error("Image generation returned no images.");
    } catch (error) {
        console.error("Error generating adventure image:", error);
        throw new Error(getApiErrorMessage(error));
    }
};

export const translateWord = async (
    word: string, 
    sourceLang: string, 
    targetLang: string,
    sourceText?: string,
    targetText?: string
): Promise<string> => {
    try {
        let prompt: string;

        if (sourceText && targetText) {
            prompt = `You are a highly precise linguistic tool. Your task is to find the exact corresponding word or phrase from a translated text.
You will be given:
1. A source language: ${sourceLang}
2. A target language: ${targetLang}
3. A word or short phrase from the source text: "${word}"
4. The full source text.
5. The full translated text.

Your mission is to identify the exact substring in the translated text that corresponds to the given word/phrase from the source text.

Rules:
- Your response MUST be ONLY the identified substring from the translated text.
- Do not provide any explanation, commentary, or extra formatting.
- If you cannot find a clear, direct correspondence, return the single best-effort word translation of "${word}".

---

Source Text:
"""
${sourceText}
"""

Translated Text:
"""
${targetText}
"""
---

Your response:`;
        } else {
            prompt = `Translate the following word from ${sourceLang} to ${targetLang}. Your response must contain ONLY the translated word and nothing else. Do not add any explanation, punctuation, or formatting.

Word: "${word}"`;
        }

        const response = await callGemini(client => client.models.generateContent({
            model: storyModel,
            contents: prompt,
            config: {
                temperature: 0,
            },
        }));

        const translatedText = response.text.trim();
        
        if (translatedText) {
             return translatedText.split('\n')[0].trim();
        }
       
        console.warn("Received an empty translation for:", word);
        throw new Error("Translation returned an empty response.");

    } catch (error) {
        console.error(`Error translating word "${word}":`, error);
        throw new Error(getApiErrorMessage(error));
    }
};
