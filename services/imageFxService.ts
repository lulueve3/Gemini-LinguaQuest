// ImageFX API client (Unofficial). Requires user-provided auth token.
// Docs/reference: https://github.com/rohitaryal/imageFX-api

export type ImageFxModel =
  | "IMAGEN_2"
  | "IMAGEN_3"
  | "IMAGEN_4"
  | "IMAGEN_3_1"
  | "IMAGEN_3_5"
  | "IMAGEN_2_LANDSCAPE"
  | "IMAGEN_3_PORTRAIT"
  | "IMAGEN_3_LANDSCAPE"
  | "IMAGEN_3_PORTRAIT_THREE_FOUR"
  | "IMAGEN_3_LANDSCAPE_FOUR_THREE"
  | "IMAGE_MODEL_NAME_UNSPECIFIED";

export type ImageFxAspectRatio =
  | "IMAGE_ASPECT_RATIO_SQUARE"
  | "IMAGE_ASPECT_RATIO_PORTRAIT"
  | "IMAGE_ASPECT_RATIO_LANDSCAPE"
  | "IMAGE_ASPECT_RATIO_UNSPECIFIED"
  | "IMAGE_ASPECT_RATIO_LANDSCAPE_FOUR_THREE"
  | "IMAGE_ASPECT_RATIO_PORTRAIT_THREE_FOUR";

export interface ImageFxOptions {
  model?: ImageFxModel; // default IMAGEN_4 (maps to IMAGEN_3_5 internally per ref impl)
  aspectRatio?: ImageFxAspectRatio; // default IMAGE_ASPECT_RATIO_LANDSCAPE
  count?: number; // default 1 (we return first image)
  seed?: number; // default undefined
}

const STORAGE_KEY = "imagefxAuthToken";
const ENDPOINT = "https://aisandbox-pa.googleapis.com/v1:runImageFx";

const getAuthToken = (): string | null => {
  const envKey =
    (import.meta as any)?.env?.VITE_IMAGEFX_AUTH_TOKEN ||
    (process as any)?.env?.VITE_IMAGEFX_AUTH_TOKEN;
  if (envKey && typeof envKey === "string") return envKey;
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
};

const setAuthToken = (token: string) => {
  localStorage.setItem(STORAGE_KEY, token);
};

const clearAuthToken = () => {
  localStorage.removeItem(STORAGE_KEY);
};

const b64ToBlob = (b64: string, mime = "image/png"): Blob => {
  const byteChars = atob(b64);
  const byteNums = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) byteNums[i] = byteChars.charCodeAt(i);
  const byteArray = new Uint8Array(byteNums);
  return new Blob([byteArray], { type: mime });
};

export const generateImageWithImageFx = async (
  prompt: string,
  options?: ImageFxOptions,
  tokenOverride?: string
): Promise<Blob> => {
  const token = tokenOverride || getAuthToken();
  if (!token) throw new Error("ImageFX auth token not configured.");

  // IMAGEN_4 maps to IMAGEN_3_5 internally in reference client
  const model: ImageFxModel = options?.model || "IMAGEN_4";
  const aspect: ImageFxAspectRatio =
    options?.aspectRatio || "IMAGE_ASPECT_RATIO_LANDSCAPE";
  const count = Math.max(1, Math.min(4, options?.count ?? 1));

  const body = {
    userInput: {
      candidatesCount: count,
      prompts: [String(prompt)],
      ...(typeof options?.seed === "number" ? { seed: options!.seed } : {}),
    },
    aspectRatio: aspect,
    modelInput: { modelNameType: model === "IMAGEN_4" ? "IMAGEN_3_5" : model },
    clientContext: { sessionId: ";1740658431200", tool: "IMAGE_FX" },
  };

  const resp = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      // NOTE: In browsers, Origin/Referer are controlled; setting them is restricted.
    },
    body: JSON.stringify(body),
  });

  let json: any = null;
  try {
    json = await resp.text();
    // If not OK, try to show text as error
    if (!resp.ok) {
      throw new Error(json || `HTTP ${resp.status}`);
    }
    json = JSON.parse(json);
  } catch (e) {
    if (!resp.ok) {
      throw new Error(
        e instanceof Error ? `ImageFX request failed: ${e.message}` : "ImageFX request failed."
      );
    }
    // If parse failed but status ok
    throw new Error("ImageFX returned non-JSON response.");
  }

  const images = json?.imagePanels?.[0]?.generatedImages;
  if (Array.isArray(images) && images.length) {
    const first = images[0];
    const b64 = first?.encodedImage;
    if (typeof b64 === "string" && b64.length) {
      return b64ToBlob(b64, "image/png");
    }
  }
  throw new Error("ImageFX response did not include an image.");
};

export default {
  getAuthToken,
  setAuthToken,
  clearAuthToken,
  generateImageWithImageFx,
};

