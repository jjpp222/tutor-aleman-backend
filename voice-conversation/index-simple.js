const fetch = require('node-fetch');

module.exports = async function (context, req) {
    context.log('Simple voice conversation test');

    // CORS headers
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
    };

    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        context.res = {
            status: 200,
            headers: corsHeaders
        };
        return;
    }

    try {
        const { transcript } = req.body || {};
        
        if (!transcript) {
            context.res = {
                status: 400,
                headers: corsHeaders,
                body: {
                    success: false,
                    error: 'transcript is required'
                }
            };
            return;
        }

        context.log(`Processing transcript: ${transcript}`);

        // Simple response without OpenAI for testing
        const germanResponse = "Hallo! Wie geht es dir heute? Ich freue mich, mit dir Deutsch zu sprechen.";

        // Test TTS API call
        const speechKey = process.env.AZURE_SPEECH_KEY;
        const speechRegion = process.env.AZURE_SPEECH_REGION || 'swedencentral';

        if (!speechKey) {
            throw new Error('AZURE_SPEECH_KEY not configured');
        }

        context.log(`Using speech region: ${speechRegion}`);
        context.log(`Speech key configured: ${speechKey ? 'YES' : 'NO'}`);

        const ssml = `
            <speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="de-DE">
                <voice name="de-DE-KatjaNeural">
                    <prosody rate="1.0" pitch="+2%">
                        <break time="200ms"/>
                        ${germanResponse}
                        <break time="300ms"/>
                    </prosody>
                </voice>
            </speak>
        `;

        context.log('Calling TTS API...');
        
        const ttsResponse = await fetch(`https://${speechRegion}.tts.speech.microsoft.com/cognitiveservices/v1`, {
            method: 'POST',
            headers: {
                'Ocp-Apim-Subscription-Key': speechKey,
                'Content-Type': 'application/ssml+xml',
                'X-Microsoft-OutputFormat': 'riff-24khz-16bit-mono-pcm',
                'User-Agent': 'TutorAleman/1.0'
            },
            body: ssml
        });

        context.log(`TTS Response status: ${ttsResponse.status}`);

        let audioData = null;
        if (ttsResponse.ok) {
            const audioBuffer = await ttsResponse.arrayBuffer();
            audioData = Buffer.from(audioBuffer).toString('base64');
            context.log(`TTS audio generated successfully, size: ${audioBuffer.byteLength} bytes`);
        } else {
            const errorText = await ttsResponse.text();
            context.log(`TTS Error: ${errorText}`);
            // Continue without audio for testing
        }

        context.res = {
            status: 200,
            headers: corsHeaders,
            body: {
                success: true,
                germanResponse: germanResponse,
                audioData: audioData,
                transcript: transcript,
                voiceUsed: 'de-DE-KatjaNeural',
                sessionId: `test_${Date.now()}`,
                timestamp: new Date().toISOString()
            }
        };

    } catch (error) {
        context.log.error('Voice conversation error:', error.message);
        context.log.error('Error stack:', error.stack);
        
        context.res = {
            status: 500,
            headers: corsHeaders,
            body: {
                success: false,
                error: error.message,
                details: error.stack,
                timestamp: new Date().toISOString()
            }
        };
    }
};