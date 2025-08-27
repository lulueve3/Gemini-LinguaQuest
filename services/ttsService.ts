// services/ttsService.ts

// A reference to the synthesis instance
const synth = window.speechSynthesis;
let voices: SpeechSynthesisVoice[] = [];

// This is a common trick to get voices on some browsers like Chrome.
const populateVoiceList = () => {
    voices = synth.getVoices();
    if (voices.length === 0 && synth.onvoiceschanged !== undefined) {
        synth.onvoiceschanged = populateVoiceList;
    }
};
populateVoiceList();

// Function to find the best matching voice for a given language code
const findVoice = (langCode: string): SpeechSynthesisVoice | null => {
    if (voices.length === 0) {
        console.warn("Speech synthesis voices not loaded yet.");
        populateVoiceList(); // try again
    }
    // Try for a perfect match first (e.g., "en-US")
    let voice = voices.find(v => v.lang === langCode);
    if (voice) return voice;

    // If no perfect match, try a generic match (e.g., "en")
    const lang = langCode.split('-')[0];
    voice = voices.find(v => v.lang.startsWith(lang));
    return voice || null;
};


export const speak = (
    text: string,
    langCode: string,
    onEnd: () => void,
    onError: () => void
) => {
    if (!synth) {
        console.error("Browser does not support speech synthesis.");
        onError();
        return;
    }

    // This is a workaround for a bug in some browsers (like Chrome) where speech synthesis
    // can get stuck in a paused state after a long period of inactivity.
    if (synth.paused) {
        synth.resume();
    }
    
    // Cancel any ongoing speech before starting a new one.
    synth.cancel();

    // Small timeout to ensure cancel has time to process on all browsers.
    setTimeout(() => {
        const utterance = new SpeechSynthesisUtterance(text);
        
        utterance.onend = () => {
            onEnd();
        };

        utterance.onerror = (event) => {
            console.error("Speech synthesis error:", event);
            onError();
        };

        const voice = findVoice(langCode);
        if (voice) {
            utterance.voice = voice;
        } else {
            console.warn(`No specific voice found for language code: ${langCode}. Using browser default.`);
            utterance.lang = langCode;
        }
        
        utterance.pitch = 1;
        utterance.rate = 1;
        utterance.volume = 1;

        synth.speak(utterance);
    }, 100); 
};


export const stop = () => {
    if (synth) {
        synth.cancel();
    }
};
