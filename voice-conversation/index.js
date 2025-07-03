const fetch = require('node-fetch');

// In-memory session storage (in production, use Redis or CosmosDB)
let conversationSessions = new Map();

module.exports = async function (context, req) {
    context.log('Voice conversation with GPT-4o and Azure TTS');

    try {
        const { transcript, sessionId, conversationHistory = [] } = req.body || {};
        
        if (!transcript) {
            context.res = {
                status: 400,
                body: {
                    success: false,
                    error: 'transcript is required'
                }
            };
            return;
        }

        // Generate session ID if not provided
        const currentSessionId = sessionId || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Get or create conversation history for this session
        let sessionHistory = conversationSessions.get(currentSessionId) || [];
        
        // If conversationHistory is provided in request, use it (for frontend state)
        if (conversationHistory.length > 0) {
            sessionHistory = conversationHistory;
        }

        context.log(`Processing transcript: ${transcript}`);

        // OpenAI Configuration
        const openaiEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
        const openaiKey = process.env.AZURE_OPENAI_KEY;
        const deploymentName = process.env.AZURE_OPENAI_DEPLOYMENT_NAME || 'gpt-4o';

        // Speech Services Configuration
        const speechKey = process.env.AZURE_SPEECH_KEY;
        const speechRegion = process.env.AZURE_SPEECH_REGION || 'swedencentral';
        
        // Voice Configuration Options (easy to test different voices)
        const voiceOptions = {
            current: 'de-DE-AmalaNeural',
            alternative1: 'de-DE-SabineNeural',
            alternative2: 'de-DE-SeraphinaMultilingualNeural'
        };
        const selectedVoice = voiceOptions.current;
        
        // Prosody Configuration Options
        const prosodyOptions = {
            rate: "1.5",
            pitch: "+8%",
            volume: "+10%",
            // Advanced pitch contour for more natural speech
            contour: "(0%,+20Hz) (50%,+30Hz) (100%,+10Hz)"
        };

        if (!openaiEndpoint || !openaiKey) {
            throw new Error('OpenAI credentials not configured');
        }

        if (!speechKey) {
            throw new Error('Speech Services key not configured');
        }

        context.log(`OpenAI Endpoint: ${openaiEndpoint}`);
        context.log(`Speech Region: ${speechRegion}`);
        context.log(`Deployment: ${deploymentName}`);

        // German tutor prompt optimized for voice conversation
        const prompt = `Eres un tutor profesional de alemán especializado en conversación oral para niveles B1 y B2.

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

        // Build messages array with conversation history
        const messages = [{ role: 'system', content: prompt }];
        
        // Add conversation history
        sessionHistory.forEach(msg => {
            messages.push(msg);
        });
        
        // Add current user message
        const currentUserMessage = { role: 'user', content: transcript.trim() };
        messages.push(currentUserMessage);

        // STEP 1: Call OpenAI for German response
        context.log('Step 1: Calling OpenAI API...');
        
        const openaiResponse = await fetch(`${openaiEndpoint}/openai/deployments/${deploymentName}/chat/completions?api-version=2024-02-15-preview`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'api-key': openaiKey
            },
            body: JSON.stringify({
                messages: messages,
                max_tokens: 150,
                temperature: 0.7,
                top_p: 0.9,
                frequency_penalty: 0.2,
                presence_penalty: 0.1
            })
        });

        context.log(`OpenAI Response status: ${openaiResponse.status}`);

        if (!openaiResponse.ok) {
            const errorText = await openaiResponse.text();
            context.log(`OpenAI Error: ${errorText}`);
            throw new Error(`OpenAI API failed: ${openaiResponse.status} - ${errorText}`);
        }

        const openaiData = await openaiResponse.json();
        const germanResponse = openaiData.choices[0]?.message?.content || 'Entschuldigung, ich konnte nicht antworten.';

        context.log(`OpenAI response: ${germanResponse}`);
        
        // Update conversation history
        const assistantMessage = { role: 'assistant', content: germanResponse };
        sessionHistory.push(currentUserMessage);
        sessionHistory.push(assistantMessage);
        
        // Limit history to last 20 messages (10 exchanges) to avoid token limits
        if (sessionHistory.length > 20) {
            sessionHistory = sessionHistory.slice(-20);
        }
        
        // Store updated history in session
        conversationSessions.set(currentSessionId, sessionHistory);

        // Clean response for speech synthesis
        const cleanResponse = germanResponse
            .replace(/[😊😄😃🙂😌🤔👍💪🎉🚀✨💯🔥⭐🌟❤️💙💚💛🧡💜🤝👏🙌🤗😍😘😗😙😚🥰😇🙃😉😋😎🤓🧐🤨🤪😜😝😛🤑🤗🤭🤫🤐🤔😴😪😵🤯🥳🥺😢😭😤😠😡🤬😱😨😰😥😓🤤🤢🤮🤧🥵🥶😶😐😑😬🙄😯😦😧😮😲🥱😴🤤🌚🌝]/g, '')
            .replace(/[\u{1F600}-\u{1F64F}]/gu, '')
            .replace(/[\u{1F300}-\u{1F5FF}]/gu, '')
            .replace(/[\u{1F680}-\u{1F6FF}]/gu, '')
            .replace(/[\u{1F1E0}-\u{1F1FF}]/gu, '')
            .replace(/[\u{2600}-\u{26FF}]/gu, '')
            .replace(/[\u{2700}-\u{27BF}]/gu, '')
            .replace(/\s+/g, ' ')
            .trim();

        // STEP 2: Generate TTS with Azure Speech Services
        context.log('Step 2: Generating TTS audio...');

        const ssml = `
            <speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="de-DE">
                <voice name="${selectedVoice}">
                    <prosody rate="${prosodyOptions.rate}" pitch="${prosodyOptions.pitch}" volume="${prosodyOptions.volume}" contour="${prosodyOptions.contour}">
                        <express-as style="conversational" styledegree="0.8">
                            ${cleanResponse}
                        </express-as>
                    </prosody>
                </voice>
            </speak>
        `;

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
            // Continue without audio - still return the text response
        }

        // STEP 3: Return complete response
        context.res = {
            status: 200,
            body: {
                success: true,
                germanResponse: cleanResponse,
                audioData: audioData,
                transcript: transcript,
                voiceUsed: audioData ? selectedVoice : 'No Audio',
                sessionId: currentSessionId,
                conversationHistory: sessionHistory,
                messageCount: sessionHistory.length,
                timestamp: new Date().toISOString(),
                pipeline: audioData ? 'GPT-4o + Azure TTS' : 'GPT-4o only'
            }
        };

        context.log('Voice conversation completed successfully');

    } catch (error) {
        context.log.error('Voice conversation error:', error.message);
        context.log.error('Error stack:', error.stack);
        
        context.res = {
            status: 500,
            body: {
                success: false,
                error: error.message,
                details: error.stack,
                timestamp: new Date().toISOString()
            }
        };
    }
};