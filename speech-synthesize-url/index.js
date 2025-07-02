// Azure Speech Services configuration
const SPEECH_KEY = process.env.AZURE_SPEECH_KEY;
const SPEECH_REGION = process.env.AZURE_SPEECH_REGION || 'swedencentral';

module.exports = async function (context, req) {
    context.log('Speech Synthesize URL request received');

    // Set CORS headers
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
        'Content-Type': 'application/json'
    };

    // Handle OPTIONS request for CORS preflight
    if (req.method === 'OPTIONS') {
        context.res = {
            status: 200,
            headers: corsHeaders
        };
        return;
    }

    try {
        // Validate environment variables
        if (!SPEECH_KEY || !SPEECH_REGION) {
            context.log.error('Missing Azure Speech configuration');
            context.res = {
                status: 500,
                headers: corsHeaders,
                body: {
                    success: false,
                    error: 'Azure Speech Services not configured'
                }
            };
            return;
        }

        // Parse request body
        const { text, voice = 'natural', language = 'de-DE', speed = 'medium' } = req.body || {};

        if (!text) {
            context.res = {
                status: 400,
                headers: corsHeaders,
                body: {
                    success: false,
                    error: 'Text is required'
                }
            };
            return;
        }

        context.log(`Synthesizing text: "${text.substring(0, 50)}..." in ${language}`);

        // Clean text (remove emojis and special characters)
        const cleanText = text
            .replace(/[😊😄😃🙂😌🤔👍💪🎉🚀✨💯🔥⭐🌟❤️💙💚💛🧡💜🤝👏🙌🤗😍😘😗😙😚🥰😇🙃😉😋😎🤓🧐🤨🤪😜😝😛🤑🤗🤭🤫🤐🤔😴😪😵🤯🥳🥺😢😭😤😠😡🤬😱😨😰😥😓🤤🤢🤮🤧🥵🥶😶😐😑😬🙄😯😦😧😮😲🥱😴🤤🌚🌝]/g, '')
            .replace(/[\u{1F600}-\u{1F64F}]/gu, '')
            .replace(/[\u{1F300}-\u{1F5FF}]/gu, '')
            .replace(/[\u{1F680}-\u{1F6FF}]/gu, '')
            .replace(/[\u{1F1E0}-\u{1F1FF}]/gu, '')
            .replace(/[\u{2600}-\u{26FF}]/gu, '')
            .replace(/[\u{2700}-\u{27BF}]/gu, '')
            .trim();

        if (!cleanText) {
            context.res = {
                status: 400,
                headers: corsHeaders,
                body: {
                    success: false,
                    error: 'No valid text to synthesize after cleaning'
                }
            };
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
        const speechUrl = `https://${SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`;
        
        const response = await fetch(speechUrl, {
            method: 'POST',
            headers: {
                'Ocp-Apim-Subscription-Key': SPEECH_KEY,
                'Content-Type': 'application/ssml+xml',
                'X-Microsoft-OutputFormat': 'riff-24khz-16bit-mono-pcm',
                'User-Agent': 'TutorAleman/1.0'
            },
            body: ssml
        });

        if (!response.ok) {
            const errorText = await response.text();
            context.log.error('Azure Speech API error:', errorText);
            throw new Error(`Azure Speech API failed: ${response.status} ${response.statusText}`);
        }

        const audioBuffer = await response.arrayBuffer();
        const audioBase64 = Buffer.from(audioBuffer).toString('base64');

        context.log('TTS synthesis successful, audio length:', audioBuffer.byteLength);

        context.res = {
            status: 200,
            headers: corsHeaders,
            body: {
                success: true,
                audioData: audioBase64,
                voiceUsed: selectedVoice,
                detectedLanguage: language,
                audioLength: audioBuffer.byteLength,
                textLength: cleanText.length
            }
        };

    } catch (error) {
        context.log.error('TTS URL error:', error.message);
        context.res = {
            status: 500,
            headers: corsHeaders,
            body: {
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            }
        };
    }
};