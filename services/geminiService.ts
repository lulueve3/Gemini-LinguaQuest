import { GoogleGenAI, Type } from "@google/genai";
import deepAiService from "./deepAiService";
import klingAiService from "./klingAiService";
import imageFxService from "./imageFxService";
import {
  AdventureStep,
  UserSettings,
  PromptSuggestion,
  CharacterProfile,
  RelationshipEdge,
  GameTag,
} from "../types";
import apiKeyService from "./apiKeyService";

const getClient = () => {
  const key = apiKeyService.getActiveKey();
  if (!key) {
    throw new Error("No API key configured. Please add an API key.");
  }
  return new GoogleGenAI({ apiKey: key });
};

const storyModel = "gemini-2.5-flash";
const ideasModel = "gemini-2.0-flash-lite";
// Default image model (can be overridden per-call). Using Gemini image preview.
const defaultImageModel = "gemini-2.5-flash-image-preview";
// Using Gemini native image preview model via generateContent

// Logging helpers
const API_DEBUG = false;
const safeSnippet = (text: unknown, limit = 800): string => {
  try {
    const s = typeof text === "string" ? text : JSON.stringify(text);
    if (!s) return "";
    return s.length > limit
      ? s.slice(0, limit) + `... [${s.length - limit} more chars]`
      : s;
  } catch {
    return String(text);
  }
};

const logApiStart = (
  label: string,
  model: string,
  prompt: any,
  config?: any
) => {
  if (!API_DEBUG) return;
  try {
    console.groupCollapsed(`[Gemini] ${label} -> model=${model}`);
    console.debug("Prompt/Contents:", safeSnippet(prompt));
    if (config) console.debug("Config:", config);
  } catch {}
};

const logApiEnd = (label: string, responseText?: string) => {
  if (!API_DEBUG) return;
  try {
    if (responseText !== undefined) {
      console.debug("Response (text):", safeSnippet(responseText));
    }
    console.groupEnd?.();
  } catch {}
};

const characterSchema = {
  type: Type.OBJECT,
  properties: {
    name: {
      type: Type.STRING,
      description: "The name of the character or monster.",
    },
    description: {
      type: Type.STRING,
      description:
        "A detailed physical description of the character or monster. This description will be used to maintain visual consistency in future images.",
    },
  },
  required: ["name", "description"],
};

const vocabularySchema = {
  type: Type.OBJECT,
  properties: {
    word: {
      type: Type.STRING,
      description:
        "A key vocabulary word from the story in the source language.",
    },
    translation: {
      type: Type.STRING,
      description: "The translation of the word in the target language.",
    },
  },
  required: ["word", "translation"],
};

const choiceSchema = {
  type: Type.OBJECT,
  properties: {
    choice: {
      type: Type.STRING,
      description:
        "An actionable choice for the player in the source language.",
    },
    translatedChoice: {
      type: Type.STRING,
      description: "The translation of the choice into the target language.",
    },
  },
  required: ["choice", "translatedChoice"],
};

const equipmentSchema = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING, description: "Name of the equipment item." },
    description: {
      type: Type.STRING,
      description: "Brief description or attributes of the item.",
    },
    equipped: {
      type: Type.BOOLEAN,
      description: "Whether the item is currently equipped.",
    },
    quantity: {
      type: Type.INTEGER,
      description: "Optional quantity for stackable items or currency.",
      nullable: true,
    },
  },
  required: ["name", "description", "equipped"],
};

const skillSchema = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING, description: "Name of the skill." },
    level: {
      type: Type.INTEGER,
      description: "Current level or proficiency of the skill.",
    },
    description: {
      type: Type.STRING,
      description: "Short description of the skill effect.",
      nullable: true,
    },
    // Keep isActive for backward compatibility with earlier prompts
    isActive: {
      type: Type.BOOLEAN,
      description: "Whether the skill is currently active or relevant.",
      nullable: true,
    },
    equipped: {
      type: Type.BOOLEAN,
      description: "Whether the skill is currently equipped (preferred field).",
      nullable: true,
    },
  },
  required: ["name", "level"],
};

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    story: {
      type: Type.STRING,
      description:
        "A paragraph of the story in the specified source language. It should be engaging and descriptive.",
    },
    translatedStory: {
      type: Type.STRING,
      description:
        "An accurate and natural-sounding translation of the story paragraph into the target language.",
    },
    imagePrompt: {
      type: Type.STRING,
      description:
        "A highly detailed and artistic prompt for an image generation model. Describe the scene, characters, mood, and style. If a specific anime/manga style is mentioned in the user's prompt or game settings, ensure the image prompt reflects that style (e.g., 'digital anime art in the style of Berserk, ...'). For example: 'Epic fantasy oil painting of a lone knight standing at the edge of a misty chasm, glowing sword in hand, cinematic lighting.'",
    },
    choices: {
      type: Type.ARRAY,
      items: choiceSchema,
      description:
        "An array of exactly 4 distinct, actionable choices for the player, each with a source language text and a target language translation.",
      minItems: 4,
      maxItems: 4,
    },
    vocabulary: {
      type: Type.ARRAY,
      items: vocabularySchema,
      description:
        "An array of 5-7 key vocabulary words from the story text that would be useful for a language learner. Provide the word in the source language and its translation in the target language.",
    },
    characters: {
      type: Type.ARRAY,
      items: characterSchema,
      description:
        "An array describing any NEW characters or monsters introduced in this story segment. If an existing character's appearance changes significantly, include them here with the updated description. Do not include characters that are already known and unchanged.",
    },
    summary: {
      type: Type.STRING,
      description:
        "A one or two sentence summary of the current step, highlighting key events to remember.",
    },
    equipment: {
      type: Type.ARRAY,
      items: equipmentSchema,
      description: "The player's current equipment list after this step.",
    },
    skills: {
      type: Type.ARRAY,
      items: skillSchema,
      description:
        "The player's current skills with levels and activation status.",
    },
    characterStatus: {
      type: Type.OBJECT,
      properties: {
        health: {
          type: Type.INTEGER,
          description: "0-100 health",
          nullable: true,
        },
        stamina: {
          type: Type.INTEGER,
          description: "0-100 stamina",
          nullable: true,
        },
        morale: {
          type: Type.INTEGER,
          description: "0-100 morale",
          nullable: true,
        },
        conditions: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "Current conditions",
          nullable: true,
        },
        notes: {
          type: Type.STRING,
          description: "Status notes",
          nullable: true,
        },
      },
      description: "Optional current character status.",
      nullable: true,
    },
  },
  required: [
    "story",
    "translatedStory",
    "imagePrompt",
    "choices",
    "vocabulary",
    "characters",
    "summary",
    "equipment",
    "skills",
  ],
};

const suggestionSchema = {
  type: Type.OBJECT,
  properties: {
    prompt: {
      type: Type.STRING,
      description:
        "A creative and engaging story prompt for a text-based RPG, based on the provided anime/manga. It should set a scene and present an initial situation for the player.",
    },
    genre: {
      type: Type.STRING,
      description:
        "A suitable genre for the story, derived from the tone and themes of the anime/manga (e.g., 'Post-Apocalyptic', 'Dark Fantasy', 'Cyberpunk').",
    },
    worldDescription: {
      type: Type.STRING,
      description:
        "A detailed paragraph describing the world, its main characteristics, and setting, based on the anime/manga.",
    },
    keyCharacters: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description:
        "A list of important characters or factions relevant to the prompt (any number). For each character, include appearance, personality, relationship to the protagonist/player, and notable powers/skills.",
    },
    keyEvents: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description:
        "A list of significant past or ongoing events that set the stage for the story (any number).",
    },
    // New meta sections for stronger world scaffolding
    rulesAndSystems: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description:
        "Key world rules, systems, constraints, magic/tech frameworks, and societal structures.",
    },
    charactersAndRoles: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description:
        "Main characters, factions, or archetypes and their roles/responsibilities.",
    },
    plotAndConflict: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description:
        "Core plot beats, arcs to respect, and conflicts between parties.",
    },
    playerBackground: {
      type: Type.STRING,
      description:
        "A concise backstory for the player's character including origin, motivation, and current status.",
    },
    playerRole: {
      type: Type.STRING,
      description:
        "The role/class/archetype the player embodies in this world.",
    },
    playerSkills: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description:
        "A list of notable skills or abilities the player's character has (any number; can expand over time).",
    },
    startingSituation: {
      type: Type.STRING,
      description:
        "A concrete starting situation or hook describing where the player begins and immediate context or objective.",
    },
    playerAppearance: {
      type: Type.STRING,
      description:
        "A short but vivid description of the player's character appearance (age, build, attire, notable features).",
    },
    playerPersonality: {
      type: Type.STRING,
      description:
        "A concise description of personality traits and demeanor influencing decisions and interactions.",
    },
    playerEquipment: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description:
        "A list of starting equipment or items (any number; can expand as the player progresses).",
    },
  },
  required: [
    "prompt",
    "genre",
    "worldDescription",
    "keyCharacters",
    "keyEvents",
    "rulesAndSystems",
    "charactersAndRoles",
    "plotAndConflict",
    "playerBackground",
    "playerRole",
    "playerSkills",
    "startingSituation",
    "playerAppearance",
    "playerPersonality",
    "playerEquipment",
  ],
};

const inspirationSchema = {
  type: Type.OBJECT,
  properties: {
    ideas: {
      type: Type.ARRAY,
      items: {
        type: Type.STRING,
        description: "A single, short, creative idea for a text-based RPG.",
      },
      description:
        "An array of exactly 8 diverse and concise ideas for a text-based RPG, inspired by various anime/manga genres.",
      minItems: 8,
      maxItems: 8,
    },
  },
  required: ["ideas"],
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
6. Any changes to the player's equipment and skills.
7. A list of character profiles for any new or changed characters/monsters.
8. A 'summary' that succinctly captures the player's current status/progress written in second person (e.g., 'You are ...'). Do NOT write 'The player is ...'.
You must respond ONLY with a valid JSON object matching the provided schema. The story should be continuous and react to the player's choices and initial prompt.`;

const getApiErrorMessage = (error: unknown): string => {
  const defaultMessage =
    "An unknown API error occurred. Please check the console for details.";
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

const callGemini = async <T>(
  fn: (client: GoogleGenAI) => Promise<T>
): Promise<T> => {
  const keys = apiKeyService.getKeys();
  if (keys.length === 0) {
    throw new Error("No API key configured. Please add an API key.");
  }
  for (let attempt = 0; attempt < keys.length; attempt++) {
    const client = getClient();
    try {
      if (API_DEBUG)
        console.debug(`[Gemini] Using API key #${attempt + 1}/${keys.length}`);
      return await fn(client);
    } catch (error) {
      if (isQuotaError(error) && attempt < keys.length - 1) {
        if (apiKeyService.switchToNextKey()) {
          if (API_DEBUG)
            console.warn("[Gemini] Quota error; switching to next API key.");
          continue;
        }
      }
      throw new Error(getApiErrorMessage(error));
    }
  }
  throw new Error("All API keys are exhausted.");
};

export const generateAdventureStep = async (
  prompt: string,
  settings: Omit<UserSettings, "prompt">,
  knownCharacters: CharacterProfile[],
  worldMeta?: import("../types").WorldMeta,
  relationships?: RelationshipEdge[]
): Promise<AdventureStep> => {
  try {
    const styleInstruction = settings.animeStyle
      ? `\nVisual Style to maintain: The anime/manga style of "${settings.animeStyle}".`
      : "";

    const characterContext =
      knownCharacters.length > 0
        ? `\n\n--- Known Characters/Monsters (Maintain Consistency) ---\n${knownCharacters
            .map((c) => `${c.name}: ${c.description}`)
            .join("\n")}`
        : "";

    const worldMetaContext = worldMeta
      ? `\n\n--- World Meta (Always Respect) ---\n` +
        `${
          worldMeta.longTermSummary
            ? `World Context: ${worldMeta.longTermSummary}\n`
            : ""
        }` +
        `${
          worldMeta.rulesAndSystems && worldMeta.rulesAndSystems.length
            ? `Rules and Systems:\n- ${worldMeta.rulesAndSystems.join(
                "\n- "
              )}\n`
            : ""
        }` +
        `${
          worldMeta.charactersAndRoles && worldMeta.charactersAndRoles.length
            ? `Faction and Roles:\n- ${worldMeta.charactersAndRoles.join(
                "\n- "
              )}\n`
            : ""
        }` +
        `${
          worldMeta.keyCharacters && worldMeta.keyCharacters.length
            ? `Key Characters:\n- ${worldMeta.keyCharacters.join("\n- ")}\n`
            : ""
        }` +
        `${
          worldMeta.plotAndConflict && worldMeta.plotAndConflict.length
            ? `Plot and Conflict:\n- ${worldMeta.plotAndConflict.join(
                "\n- "
              )}\n`
            : ""
        }` +
        `${
          worldMeta.keyEvents && worldMeta.keyEvents.length
            ? `Canonical Key Events:\n- ${worldMeta.keyEvents.join("\n- ")}`
            : ""
        }`
      : "";

    const relationshipContext = (relationships && relationships.length)
      ? (() => {
          const lines = relationships.map(r => {
            const parts: string[] = [];
            parts.push(`with: ${r.with}`);
            parts.push(`type: ${r.type}`);
            if (typeof r.affection === 'number') parts.push(`affection: ${r.affection}`);
            if (typeof r.trust === 'number') parts.push(`trust: ${r.trust}`);
            if (typeof r.loyalty === 'number') parts.push(`loyalty: ${r.loyalty}`);
            if (typeof r.jealousy === 'number') parts.push(`jealousy: ${r.jealousy}`);
            if (r.notes) parts.push(`notes: ${r.notes}`);
            return `- ${parts.join('; ')}`;
          }).join("\n");
          const guidance = (settings.tags?.includes(GameTag.Romance) || settings.tags?.includes(GameTag.Harem))
            ? "For romance/harem dynamics, keep affection/trust consistent, avoid sudden shifts without narrative cause, and reflect jealousy/loyalty tensions in dialogue and choices."
            : "Maintain continuity of relationships, adjusting gradually based on events. Do not contradict existing relationship facts.";
          return `\n\n--- Relationship Context (Maintain and Update Consistently) ---\nGuidance: ${guidance}\nRelationships:\n${lines}`;
        })()
      : "";

    const fullPrompt = `${prompt}${characterContext}${worldMetaContext}${relationshipContext}\n\nGame settings:\nSource Language: ${settings.sourceLanguage}\nTarget Language: ${settings.targetLanguage}\nGenre: ${settings.genre}${styleInstruction}`;

    const reqCfg = {
      systemInstruction: systemInstruction,
      responseMimeType: "application/json",
      responseSchema: responseSchema,
      temperature: 0.8,
    } as const;
    logApiStart("generateAdventureStep", storyModel, fullPrompt, reqCfg);
    const response = await callGemini((client) =>
      client.models.generateContent({
        model: storyModel,
        contents: fullPrompt,
        config: reqCfg,
      })
    );

    const jsonText = response.text.trim();
    logApiEnd("generateAdventureStep", jsonText);
    const parsedJson = JSON.parse(jsonText);

    if (
      parsedJson.story &&
      parsedJson.translatedStory &&
      parsedJson.imagePrompt &&
      typeof parsedJson.summary === "string" &&
      Array.isArray(parsedJson.choices) &&
      parsedJson.choices.length === 4 &&
      Array.isArray(parsedJson.vocabulary) &&
      Array.isArray(parsedJson.characters) &&
      Array.isArray(parsedJson.equipment) &&
      Array.isArray(parsedJson.skills)
    ) {
      return parsedJson as AdventureStep;
    } else {
      console.error("Invalid JSON structure received from Gemini:", parsedJson);
      throw new Error(
        "Received an invalid or incomplete data structure from the AI."
      );
    }
  } catch (error) {
    console.error("Error generating adventure step:", error);
    throw new Error(getApiErrorMessage(error));
  }
};

export const generatePromptSuggestion = async (
  animeName: string
): Promise<PromptSuggestion> => {
  try {
    const fullPrompt = `Based on the anime/manga "${animeName}", generate a detailed suggestion for a text-based RPG.
Provide:
- A creative story prompt to kick off the adventure
- A suitable genre
- A richly detailed world description (World Context)
- Key Characters: list the main characters of the story. For each, include a concise description covering appearance, personality, relationship to the protagonist/player, and notable powers/skills.
- Key Events: a list of significant background events that set the stage
- Rules and Systems: the world's rules, systems, societal structures, and constraints (bulleted)
- Faction and Roles: describe specific factions and their roles within the storyline (faction conflict, good vs. evil, etc.).
- Player character details: role/class, concise background, skills (any number), appearance, personality, starting equipment (any number), and a concrete starting situation.
- Plot and Conflict: the core plot beats and major conflicts to respect (bulleted)`;

    const cfg = {
      systemInstruction:
        "You are a creative assistant helping a user brainstorm ideas for a role-playing game. You must respond ONLY with a valid JSON object that strictly matches the provided schema, including detailed player character fields. For keyCharacters, each item must succinctly include appearance, personality, relationship to the protagonist/player, and notable powers/skills.",
      responseMimeType: "application/json",
      responseSchema: suggestionSchema,
      temperature: 0.7,
    } as const;
    logApiStart("generatePromptSuggestion", storyModel, fullPrompt, cfg);
    const response = await callGemini((client) =>
      client.models.generateContent({
        model: storyModel,
        contents: fullPrompt,
        config: cfg,
      })
    );

    const jsonText = response.text.trim();
    logApiEnd("generatePromptSuggestion", jsonText);
    const parsedJson = JSON.parse(jsonText);

    if (
      parsedJson.prompt &&
      parsedJson.genre &&
      parsedJson.worldDescription &&
      Array.isArray(parsedJson.keyCharacters) &&
      Array.isArray(parsedJson.keyEvents) &&
      Array.isArray(parsedJson.rulesAndSystems) &&
      Array.isArray(parsedJson.charactersAndRoles) &&
      Array.isArray(parsedJson.plotAndConflict) &&
      typeof parsedJson.playerBackground === "string" &&
      typeof parsedJson.playerRole === "string" &&
      Array.isArray(parsedJson.playerSkills) &&
      typeof parsedJson.startingSituation === "string" &&
      typeof parsedJson.playerAppearance === "string" &&
      typeof parsedJson.playerPersonality === "string" &&
      Array.isArray(parsedJson.playerEquipment)
    ) {
      return parsedJson as PromptSuggestion;
    } else {
      console.error(
        "Invalid JSON structure received for prompt suggestion:",
        parsedJson
      );
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

    const cfg = {
      systemInstruction:
        "You are a creative assistant that provides a JSON object containing a list of exactly 8 short RPG ideas. You must respond ONLY with a valid JSON object matching the provided schema.",
      responseMimeType: "application/json",
      responseSchema: inspirationSchema,
      temperature: 0.9,
    } as const;
    logApiStart("generateInspirationIdeas", ideasModel, prompt, cfg);
    const response = await callGemini((client) =>
      client.models.generateContent({
        model: ideasModel,
        contents: prompt,
        config: cfg,
      })
    );

    const jsonText = response.text.trim();
    logApiEnd("generateInspirationIdeas", jsonText);
    const parsedJson = JSON.parse(jsonText);

    if (Array.isArray(parsedJson.ideas) && parsedJson.ideas.length === 8) {
      return parsedJson.ideas as string[];
    } else {
      console.error(
        "Invalid JSON structure for inspiration ideas:",
        parsedJson
      );
      throw new Error("Received invalid data for inspiration ideas.");
    }
  } catch (error) {
    console.error("Error generating inspiration ideas:", error);
    throw new Error(getApiErrorMessage(error));
  }
};

export const generateAdventureImage = async (
  prompt: string,
  model?: string
): Promise<Blob> => {
  try {
    const imageModel = model || defaultImageModel;
    logApiStart("generateAdventureImage", imageModel, prompt);

    // Branch 0: DeepAI text2img
    if (imageModel === "deepai-text2img" || imageModel?.toLowerCase().startsWith("deepai")) {
      const blob = await deepAiService.generateImageWithDeepAI(prompt);
      return blob;
    }

    // Branch 0.5: KlingAI text2img (kling-v2-1)
    if (imageModel === "kling-v2-1" || imageModel?.toLowerCase().startsWith("kling")) {
      const blob = await klingAiService.generateImageWithKling(prompt);
      return blob;
    }

    // Branch 0.7: ImageFX text2img via unofficial API (imagefx-api)
    if (imageModel === "imagefx-api" || imageModel?.toLowerCase().startsWith("imagefx")) {
      const blob = await imageFxService.generateImageWithImageFx(prompt, {
        // Defaults; could be made configurable later
        model: "IMAGEN_4",
        aspectRatio: "IMAGE_ASPECT_RATIO_LANDSCAPE",
        count: 1,
      });
      return blob;
    }

    // Branch 1: Imagen models via models.generateImages
    if (/^imagen-/.test(imageModel)) {
      const imgResp = await callGemini((client) =>
        (client as any).models.generateImages({
          model: imageModel,
          prompt,
          config: { numberOfImages: 1 },
        })
      );

      const generatedImages: any[] = (imgResp as any).generatedImages || [];
      for (const g of generatedImages) {
        const base64: string | undefined = g?.image?.imageBytes;
        const mime: string = g?.mimeType || "image/png";
        if (base64) {
          const byteChars = atob(base64);
          const byteNums = new Array(byteChars.length);
          for (let i = 0; i < byteChars.length; i++)
            byteNums[i] = byteChars.charCodeAt(i);
          const byteArray = new Uint8Array(byteNums);
          return new Blob([byteArray], { type: mime });
        }
      }
      throw new Error("Imagen generation returned no image data.");
    }

    // Branch 2: Gemini 2.5 image preview via streaming
    if (imageModel === "gemini-2.5-flash-image-preview") {
      const blob = await callGemini(async (client) => {
        const stream = await (client as any).models.generateContentStream({
          model: imageModel,
          config: {
            responseModalities: ["IMAGE", "TEXT"],
          },
          contents: [{ role: "user", parts: [{ text: String(prompt) }] }],
        });
        for await (const chunk of stream as any) {
          const parts: any[] = chunk?.candidates?.[0]?.content?.parts || [];
          for (const part of parts) {
            const inline = part?.inlineData;
            if (inline?.data) {
              const base64: string = inline.data;
              const mime: string = inline.mimeType || "image/png";
              const byteChars = atob(base64);
              const byteNums = new Array(byteChars.length);
              for (let i = 0; i < byteChars.length; i++)
                byteNums[i] = byteChars.charCodeAt(i);
              const byteArray = new Uint8Array(byteNums);
              return new Blob([byteArray], { type: mime });
            }
          }
        }
        throw new Error("Gemini image preview returned no image data.");
      });
      return blob;
    }

    // Fallback: try non-stream generateContent for inlineData images
    const response = await callGemini((client) =>
      client.models.generateContent({ model: imageModel, contents: prompt })
    );
    const candidates: any[] = (response as any).candidates || [];
    for (const cand of candidates) {
      const parts: any[] = cand?.content?.parts || [];
      for (const part of parts) {
        if (part?.inlineData?.data) {
          const base64 = part.inlineData.data as string;
          const mime = (part.inlineData.mimeType as string) || "image/png";
          const byteChars = atob(base64);
          const byteNums = new Array(byteChars.length);
          for (let i = 0; i < byteChars.length; i++)
            byteNums[i] = byteChars.charCodeAt(i);
          const byteArray = new Uint8Array(byteNums);
          return new Blob([byteArray], { type: mime });
        }
      }
    }
    throw new Error("Image generation returned no inline image data.");
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

    logApiStart("translateWord", storyModel, prompt, { temperature: 0 });
    const response = await callGemini((client) =>
      client.models.generateContent({
        model: storyModel,
        contents: prompt,
        config: {
          temperature: 0,
        },
      })
    );

    const translatedText = response.text.trim();
    logApiEnd("translateWord", translatedText);

    if (translatedText) {
      return translatedText.split("\n")[0].trim();
    }

    console.warn("Received an empty translation for:", word);
    throw new Error("Translation returned an empty response.");
  } catch (error) {
    console.error(`Error translating word "${word}":`, error);
    throw new Error(getApiErrorMessage(error));
  }
};
