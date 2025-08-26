// services/elevenLabsService.ts
const ELEVENLABS_API_URL = "https://api.elevenlabs.io/v1/text-to-sound-effects";

export const generateSoundEffect = async (text: string, apiKey: string): Promise<string | null> => {
    if (!apiKey) {
        console.error("ElevenLabs API key is missing.");
        return null;
    }

    try {
        const response = await fetch(ELEVENLABS_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'xi-api-key': apiKey,
            },
            body: JSON.stringify({
                text: text,
            }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`ElevenLabs API error (${response.status}): ${errorData.detail?.message || 'Failed to generate sound effect'}`);
        }

        const audioBlob = await response.blob();
        if (audioBlob.type !== 'audio/mpeg') {
            throw new Error('Invalid audio data received from ElevenLabs.');
        }
        return URL.createObjectURL(audioBlob);

    } catch (error) {
        console.error("Error generating sound effect:", error);
        return null;
    }
};