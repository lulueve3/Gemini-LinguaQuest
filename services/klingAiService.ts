// KlingAI image generation service with JWT auth (AccessKey + SecretKey)

const ACCESS_KEY_STORAGE = "klingAccessKey";
const SECRET_KEY_STORAGE = "klingSecretKey";
const ENDPOINT_STORAGE = "klingApiEndpoint";
const DEFAULT_ENDPOINT =
  "https://api-singapore.klingai.com/v1/images/generations";

export interface KlingAIOptions {
  // Future: add size/width/height, etc.
}

const getAccessKey = (): string | null => {
  const env =
    (import.meta as any)?.env?.VITE_KLING_ACCESS_KEY ||
    (process as any)?.env?.VITE_KLING_ACCESS_KEY;
  if (env && typeof env === "string") return env;
  try {
    return localStorage.getItem(ACCESS_KEY_STORAGE);
  } catch {
    return null;
  }
};

const getSecretKey = (): string | null => {
  const env =
    (import.meta as any)?.env?.VITE_KLING_SECRET_KEY ||
    (process as any)?.env?.VITE_KLING_SECRET_KEY;
  if (env && typeof env === "string") return env;
  try {
    return localStorage.getItem(SECRET_KEY_STORAGE);
  } catch {
    return null;
  }
};

const setAccessKey = (key: string) =>
  localStorage.setItem(ACCESS_KEY_STORAGE, key);
const setSecretKey = (key: string) =>
  localStorage.setItem(SECRET_KEY_STORAGE, key);
const clearAccessKey = () => localStorage.removeItem(ACCESS_KEY_STORAGE);
const clearSecretKey = () => localStorage.removeItem(SECRET_KEY_STORAGE);

const getEndpoint = (): string => {
  const env =
    (import.meta as any)?.env?.VITE_KLING_API_ENDPOINT ||
    (process as any)?.env?.VITE_KLING_API_ENDPOINT;
  if (env && typeof env === "string") return env as string;
  try {
    const stored = localStorage.getItem(ENDPOINT_STORAGE);
    return stored || DEFAULT_ENDPOINT;
  } catch {
    return DEFAULT_ENDPOINT;
  }
};

const setEndpoint = (url: string) =>
  localStorage.setItem(ENDPOINT_STORAGE, url);
const clearEndpoint = () => localStorage.removeItem(ENDPOINT_STORAGE);

const toBlobFromBase64 = (b64: string, mime = "image/png"): Blob => {
  const byteChars = atob(b64);
  const byteNums = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++)
    byteNums[i] = byteChars.charCodeAt(i);
  const byteArray = new Uint8Array(byteNums);
  return new Blob([byteArray], { type: mime });
};

const extractImageFromResponse = async (json: any): Promise<Blob | null> => {
  try {
    // OpenAI-like
    const b64OpenAI = json?.data?.[0]?.b64_json;
    if (b64OpenAI) return toBlobFromBase64(b64OpenAI);
    const urlOpenAI = json?.data?.[0]?.url;
    if (urlOpenAI) {
      const r = await fetch(urlOpenAI);
      if (!r.ok) return null;
      return await r.blob();
    }
    // Generic arrays
    const b64Generic =
      json?.images?.[0]?.image_bytes ||
      json?.images?.[0]?.b64_json ||
      json?.output?.[0]?.image_base64;
    if (b64Generic) return toBlobFromBase64(b64Generic);
    const urlGeneric = json?.images?.[0]?.url || json?.output?.url || json?.url;
    if (urlGeneric) {
      const r = await fetch(urlGeneric);
      if (!r.ok) return null;
      return await r.blob();
    }
  } catch {}
  return null;
};

// --- Minimal JWT (HS256) implementation using Web Crypto ---
const base64url = (arr: Uint8Array): string => {
  let str = "";
  for (let i = 0; i < arr.length; i++) str += String.fromCharCode(arr[i]);
  const b64 = btoa(str)
    .replace(/=+$/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  return b64;
};

const textToBytes = (s: string): Uint8Array => new TextEncoder().encode(s);

const jsonToBytes = (obj: unknown): Uint8Array =>
  textToBytes(JSON.stringify(obj));

async function hmacSha256(
  keyBytes: Uint8Array,
  data: Uint8Array
): Promise<Uint8Array> {
  // Use Web Crypto if available
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const key = await crypto.subtle.importKey(
      "raw",
      keyBytes,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const sig = await crypto.subtle.sign("HMAC", key, data);
    return new Uint8Array(sig);
  }
  // Fallback to Node crypto if present (for SSR/testing)
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const nodeCrypto = require("crypto");
    const h = nodeCrypto.createHmac("sha256", Buffer.from(keyBytes));
    h.update(Buffer.from(data));
    return new Uint8Array(h.digest());
  } catch {
    throw new Error("Crypto not available to create JWT.");
  }
}

async function createKlingJwt(
  accessKey: string,
  secretKey: string,
  ttlSeconds = 1800
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  // Per Kling docs: iss, exp (= now + 1800s), nbf (= now - 5s)
  const payload: Record<string, any> = {
    iss: accessKey,
    exp: now + ttlSeconds,
    nbf: now - 5,
  };
  const headerB64 = base64url(jsonToBytes(header));
  const payloadB64 = base64url(jsonToBytes(payload));
  const signingInput = `${headerB64}.${payloadB64}`;
  const sig = await hmacSha256(
    textToBytes(secretKey),
    textToBytes(signingInput)
  );
  const sigB64 = base64url(sig);
  return `${signingInput}.${sigB64}`;
}

export const generateImageWithKling = async (
  prompt: string,
  options?: KlingAIOptions
): Promise<Blob> => {
  const accessKey = getAccessKey();
  const secretKey = getSecretKey();
  const endpoint = getEndpoint();
  if (!accessKey || !secretKey)
    throw new Error("KlingAI AccessKey/SecretKey not configured.");
  const token = await createKlingJwt(accessKey, secretKey);

  // Send flexible headers to accommodate doc variants
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  const body = {
    model: "kling-v2-1",
    prompt,
    n: 1,
  };

  const resp = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  let json: any = null;
  try {
    json = await resp.json();
  } catch {}
  if (!resp.ok) {
    const msg = (json && (json.error || json.message)) || `HTTP ${resp.status}`;
    throw new Error(`KlingAI request failed: ${msg}`);
  }

  const blob = await extractImageFromResponse(json);
  if (blob) return blob;
  throw new Error("KlingAI response did not include an image.");
};

export default {
  getAccessKey,
  setAccessKey,
  clearAccessKey,
  getSecretKey,
  setSecretKey,
  clearSecretKey,
  getEndpoint,
  setEndpoint,
  clearEndpoint,
  generateImageWithKling,
};
