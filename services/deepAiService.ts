// Lightweight DeepAI Text-to-Image service wrapper
// Docs: https://deepai.org/machine-learning-model/text2img

const STORAGE_KEY = 'deepaiApiKey';
const ENDPOINT = 'https://api.deepai.org/api/text2img';

export interface DeepAIResponse {
  id?: string;
  output_url?: string;
  status?: string;
  error?: string;
  [k: string]: any;
}

export type DeepAIImageVersion = 'standard' | 'hd' | 'genius';
export type DeepAIGeniusPreference = 'anime' | 'photography' | 'graphic' | 'cinematic';

export interface DeepAIOptions {
  width?: number | string; // multiples of 32, 128..1536
  height?: number | string; // multiples of 32, 128..1536
  imageGeneratorVersion?: DeepAIImageVersion; // default standard
  geniusPreference?: DeepAIGeniusPreference; // only if version = genius
}

const getApiKey = (): string | null => {
  // Prefer env if present, fallback to localStorage
  const envKey = (import.meta as any)?.env?.VITE_DEEPAI_API_KEY || (process as any)?.env?.VITE_DEEPAI_API_KEY;
  if (envKey && typeof envKey === 'string') return envKey;
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
};

const setApiKey = (key: string) => {
  localStorage.setItem(STORAGE_KEY, key);
};

const clearApiKey = () => {
  localStorage.removeItem(STORAGE_KEY);
};

const getErrorMessage = (resp: DeepAIResponse | unknown): string => {
  try {
    const r = resp as any;
    if (r?.error) return String(r.error);
    if (r?.status && r?.status !== 'success') return `DeepAI error: ${r.status}`;
  } catch {}
  return 'DeepAI request failed.';
};

const normalizeDimension = (value: number | string | undefined, fallback: number): string => {
  let n = fallback;
  if (typeof value === 'number') n = value;
  else if (typeof value === 'string' && value.trim()) {
    const parsed = parseInt(value, 10);
    if (!Number.isNaN(parsed)) n = parsed;
  }
  // clamp to [128, 1536]
  n = Math.max(128, Math.min(1536, n));
  // round to nearest multiple of 32
  n = Math.round(n / 32) * 32;
  return String(n);
};

export const generateImageWithDeepAI = async (
  promptOrUrl: string,
  apiKey?: string,
  options?: DeepAIOptions
): Promise<Blob> => {
  const key = apiKey || getApiKey();
  if (!key) throw new Error('DeepAI API key not configured.');

  const width = normalizeDimension(options?.width, 512);
  const height = normalizeDimension(options?.height, 512);
  const version: DeepAIImageVersion = options?.imageGeneratorVersion || 'standard';
  const body: Record<string, any> = {
    text: promptOrUrl,
    width,
    height,
    image_generator_version: version,
  };
  if (version === 'genius' && options?.geniusPreference) {
    body.genius_preference = options.geniusPreference;
  }
  const resp = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': key,
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    // Try to parse error body for details
    let details: any = null;
    try { details = await resp.json(); } catch {}
    const msg = details?.error || `HTTP ${resp.status}`;
    throw new Error(`DeepAI request failed: ${msg}`);
  }

  const data: DeepAIResponse = await resp.json();
  if (!data.output_url) {
    throw new Error(getErrorMessage(data));
  }

  // Fetch the resulting image URL and return as Blob
  const imgResp = await fetch(data.output_url);
  if (!imgResp.ok) throw new Error(`Failed to fetch DeepAI image: HTTP ${imgResp.status}`);
  const blob = await imgResp.blob();
  return blob;
};

export default {
  getApiKey,
  setApiKey,
  clearApiKey,
  generateImageWithDeepAI,
};
