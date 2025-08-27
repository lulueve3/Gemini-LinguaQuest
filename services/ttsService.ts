// services/ttsService.ts

let voices: SpeechSynthesisVoice[] = [];

const loadVoices = () => {
    // Filter to get high-quality, local voices if possible
    const allVoices = window.speechSynthesis.getVoices();
    voices = allVoices.filter(voice => voice.localService);
    if (voices.length === 0) {
        voices = allVoices; // Fallback to all voices if no local ones are available
    }
};

// Voices are often loaded asynchronously.
if (typeof window !== 'undefined' && window.speechSynthesis) {
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = loadVoices;
    }
    loadVoices(); // Initial load attempt
}


const findBestVoice = (lang: string): SpeechSynthesisVoice | null => {
    if (voices.length === 0) {
        loadVoices();
    }
    if (voices.length === 0) return null; // Still no voices

    // BCP 47 language code (e.g., 'en-US', 'vi-VN')
    const langPrefix = lang.split('-')[0];

    // 1. Exact match
    let perfectMatch = voices.find(v => v.lang === lang);
    if (perfectMatch) return perfectMatch;
    
    // 2. Language prefix match (e.g., 'en' for 'en-US') that is also default for the locale
    let defaultMatch = voices.find(v => v.lang.startsWith(langPrefix) && v.default);
    if (defaultMatch) return defaultMatch;

    // 3. Any language prefix match
    let prefixMatch = voices.find(v => v.lang.startsWith(langPrefix));
    if (prefixMatch) return prefixMatch;

    return null;
};

export const speak = (
    text: string, 
    lang: string, 
    onEnd: () => void, 
    onError: () => void
) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
        console.error("Text-to-Speech is not supported by this browser.");
        onError();
        return;
    }
  
    // Stop any currently speaking utterance before starting a new one.
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    const voice = findBestVoice(lang);
  
    if (voice) {
        utterance.voice = voice;
    } else {
        // Fallback to the browser's default for the specified language tag.
        utterance.lang = lang;
        console.warn(`No specific voice found for lang '${lang}'. Using browser default.`);
    }

    utterance.onend = onEnd;
    utterance.onerror = (e) => {
        console.error("Speech synthesis error:", e);
        onError();
    };
  
    window.speechSynthesis.speak(utterance);
};

export const stop = () => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
    }
};
