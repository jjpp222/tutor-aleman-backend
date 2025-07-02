const fetch = require('node-fetch');
const { config, logWithContext, handleCorsPrelight, createErrorResponse, createSuccessResponse, validateInput, sanitizeTextForSpeech } = require('../shared/utils');

// German tutor system prompt for voice conversation
const VOICE_TUTOR_SYSTEM_PROMPT = `Eres un tutor profesional de alemán especializado en conversación oral para niveles B1 y B2.

IMPORTANTE: 
- SIEMPRE responde ÚNICAMENTE en alemán
- Mantén respuestas cortas (máximo 2-3 frases)
- Adapta tu nivel al estudiante
- Corrige errores de forma natural en la conversación
- Si detectas errores graves, menciona la corrección brevemente en alemán
- Sé paciente y motivador
- Usa vocabulario apropiado para B1-B2

TEMAS: vida cotidiana, trabajo, viajes, cultura alemana, planes, gustos.

Responde de forma natural y conversacional, como un tutor nativo alemán paciente.`;

module.exports = async function (context, req) {
    logWithContext(context, 'info', 'Voice conversation request received');

    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        handleCorsPrelight(context);
        return;
    }

    try {
        // Validate configuration
        config.validate();

        // Parse and validate input
        const { transcript } = req.body || {};
        const validationErrors = validateInput({ transcript }, ['transcript']);
        
        if (validationErrors.length > 0) {
            context.res = createErrorResponse(400, 'Invalid input', validationErrors);
            return;
        }

        const cleanTranscript = transcript.trim();
        logWithContext(context, 'info', `Processing voice input: "${cleanTranscript}"`);

        // Prepare messages for Azure OpenAI
        const messages = [
            { role: 'system', content: VOICE_TUTOR_SYSTEM_PROMPT },
            { role: 'user', content: cleanTranscript }
        ];

        // Call Azure OpenAI
        const openaiResponse = await fetch(`${config.openai.endpoint}/openai/deployments/${config.openai.deploymentName}/chat/completions?api-version=2024-02-15-preview`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'api-key': config.openai.key
            },
            body: JSON.stringify({
                messages: messages,
                max_tokens: 150, // Respuestas más cortas para conversación
                temperature: 0.7,
                top_p: 0.9,
                frequency_penalty: 0.2,
                presence_penalty: 0.1
            })
        });

        if (!openaiResponse.ok) {
            const errorText = await openaiResponse.text();
            logWithContext(context, 'error', 'Azure OpenAI API error', errorText);
            throw new Error(`Azure OpenAI API failed: ${openaiResponse.status}`);
        }

        const openaiData = await openaiResponse.json();
        const germanResponse = openaiData.choices[0]?.message?.content || 'Entschuldigung, ich konnte nicht antworten.';

        // Clean response for speech
        const cleanResponse = sanitizeTextForSpeech(germanResponse);

        logWithContext(context, 'info', 'Voice conversation processed successfully');

        // Generate TTS audio
        const ttsResponse = await fetch(`${config.speech.region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
            method: 'POST',
            headers: {
                'Ocp-Apim-Subscription-Key': config.speech.key,
                'Content-Type': 'application/ssml+xml',
                'X-Microsoft-OutputFormat': 'riff-24khz-16bit-mono-pcm',
                'User-Agent': 'TutorAleman/1.0'
            },
            body: `
                <speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="de-DE">
                    <voice name="de-DE-KatjaNeural">
                        <prosody rate="1.0" pitch="+2%">
                            <break time="200ms"/>
                            ${cleanResponse}
                            <break time="300ms"/>
                        </prosody>
                    </voice>
                </speak>
            `
        });

        let audioData = null;
        if (ttsResponse.ok) {
            const audioBuffer = await ttsResponse.arrayBuffer();
            audioData = Buffer.from(audioBuffer).toString('base64');
            logWithContext(context, 'info', 'TTS audio generated successfully');
        } else {
            logWithContext(context, 'warn', 'TTS generation failed, continuing without audio');
        }

        context.res = createSuccessResponse({
            germanResponse: cleanResponse,
            audioData: audioData,
            transcript: cleanTranscript,
            voiceUsed: 'de-DE-KatjaNeural',
            sessionId: `voice_${Date.now()}`
        });

    } catch (error) {
        logWithContext(context, 'error', 'Voice conversation error', error.message);
        context.res = createErrorResponse(500, 'Error processing voice conversation', error.message);
    }
};