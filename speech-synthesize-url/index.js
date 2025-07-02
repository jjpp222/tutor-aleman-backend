const fetch = require('node-fetch');
const { config, logWithContext, handleCorsPrelight, createErrorResponse, createSuccessResponse, validateInput, sanitizeTextForSpeech } = require('../shared/utils');

module.exports = async function (context, req) {
    logWithContext(context, 'info', 'Speech Synthesize URL request received');

    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        handleCorsPrelight(context);
        return;
    }

    try {
        // Validate configuration
        config.validate();

        // Parse and validate input
        const { text, voice = 'natural', language = 'de-DE', speed = 'medium' } = req.body || {};
        const validationErrors = validateInput({ text }, ['text']);
        
        if (validationErrors.length > 0) {
            context.res = createErrorResponse(400, 'Invalid input', validationErrors);
            return;
        }

        logWithContext(context, 'info', `Synthesizing text: "${text.substring(0, 50)}..." in ${language}`);

        // Clean text
        const cleanText = sanitizeTextForSpeech(text);

        if (!cleanText) {
            context.res = createErrorResponse(400, 'No valid text to synthesize after cleaning');
            return;
        }

        // Voice mapping for better quality
        const voiceMap = {
            'de-DE': {
                natural: 'de-DE-KatjaNeural',
                professional: 'de-DE-ConradNeural',
                casual: 'de-DE-AmalaNeural',
                male: 'de-DE-ConradNeural',
                female: 'de-DE-KatjaNeural'
            },
            'es-ES': {
                natural: 'es-ES-ElviraNeural',
                professional: 'es-ES-AlvaroNeural',
                casual: 'es-ES-AbrilNeural',
                male: 'es-ES-AlvaroNeural',
                female: 'es-ES-ElviraNeural'
            }
        };

        const selectedVoice = voiceMap[language]?.[voice] || voiceMap['de-DE']['natural'];
        
        // Speed mapping for more natural speech
        const speedMap = {
            slow: '0.8',
            medium: '1.1',
            fast: '1.3',
            natural: '1.0'
        };
        const speechRate = speedMap[speed] || '1.1';

        // Create optimized SSML for natural speech
        const ssml = `
            <speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${language}">
                <voice name="${selectedVoice}">
                    <prosody rate="${speechRate}" pitch="+5%">
                        <break time="200ms"/>
                        ${cleanText}
                        <break time="300ms"/>
                    </prosody>
                </voice>
            </speak>
        `;

        // Azure Speech Services API call
        const speechUrl = `https://${config.speech.region}.tts.speech.microsoft.com/cognitiveservices/v1`;
        
        const response = await fetch(speechUrl, {
            method: 'POST',
            headers: {
                'Ocp-Apim-Subscription-Key': config.speech.key,
                'Content-Type': 'application/ssml+xml',
                'X-Microsoft-OutputFormat': 'riff-24khz-16bit-mono-pcm',
                'User-Agent': 'TutorAleman/1.0'
            },
            body: ssml
        });

        if (!response.ok) {
            const errorText = await response.text();
            logWithContext(context, 'error', 'Azure Speech API error', errorText);
            throw new Error(`Azure Speech API failed: ${response.status} ${response.statusText}`);
        }

        const audioBuffer = await response.arrayBuffer();
        const audioBase64 = Buffer.from(audioBuffer).toString('base64');

        logWithContext(context, 'info', 'TTS synthesis successful', { audioLength: audioBuffer.byteLength });

        context.res = createSuccessResponse({
            audioData: audioBase64,
            voiceUsed: selectedVoice,
            detectedLanguage: language,
            audioLength: audioBuffer.byteLength,
            textLength: cleanText.length
        });

    } catch (error) {
        logWithContext(context, 'error', 'TTS URL error', error.message);
        context.res = createErrorResponse(500, error.message);
    }
};