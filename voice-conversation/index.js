const fetch = require('node-fetch');
const { DatabaseService } = require('../shared/database');
const jwt = require('jsonwebtoken');

module.exports = async function (context, req) {
    context.log('Voice conversation with corrected Speech Services key');

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
        const { transcript, sessionId } = req.body || {};
        
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

        // Extract userId from JWT token
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            context.res = {
                status: 401,
                headers: corsHeaders,
                body: {
                    success: false,
                    error: 'Authorization token required'
                }
            };
            return;
        }

        const token = authHeader.substring(7);
        const jwtSecret = process.env.JWT_SECRET;
        let decoded;
        
        try {
            decoded = jwt.verify(token, jwtSecret);
        } catch (error) {
            context.res = {
                status: 401,
                headers: corsHeaders,
                body: {
                    success: false,
                    error: 'Invalid token'
                }
            };
            return;
        }

        const userId = decoded.userId;
        const currentSessionId = sessionId || `session_${Date.now()}`;
        
        context.log(`Processing transcript: ${transcript} for user: ${userId}, session: ${currentSessionId}`);

        // OpenAI Configuration
        const openaiEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
        const openaiKey = process.env.AZURE_OPENAI_KEY;
        const deploymentName = process.env.AZURE_OPENAI_DEPLOYMENT_NAME || 'SprachMeister-GPT4o';

        // Speech Services Configuration (CORRECTED)
        const speechKey = process.env.AZURE_SPEECH_KEY;
        const speechRegion = process.env.AZURE_SPEECH_REGION || 'swedencentral';

        if (!openaiEndpoint || !openaiKey) {
            throw new Error('OpenAI credentials not configured');
        }

        if (!speechKey) {
            throw new Error('Speech Services key not configured');
        }

        context.log(`OpenAI Endpoint: ${openaiEndpoint}`);
        context.log(`Speech Region: ${speechRegion}`);
        context.log(`Keys configured - OpenAI: ${openaiKey ? 'YES' : 'NO'}, Speech: ${speechKey ? 'YES' : 'NO'}`);

        // STEP 1: Handle conversation persistence
        context.log('Step 1: Managing conversation persistence...');
        
        // Get or create active conversation
        let conversation = await DatabaseService.getActiveConversation(userId, currentSessionId);
        if (!conversation) {
            conversation = await DatabaseService.createConversation(userId, currentSessionId);
            context.log(`Created new conversation: ${conversation.id}`);
        } else {
            context.log(`Using existing conversation: ${conversation.id}`);
        }

        // Add user input to conversation
        await DatabaseService.addExchangeToConversation(conversation.id, userId, {
            speaker: 'user',
            transcript: transcript,
            language: 'de'
        });

        // Build conversation context for GPT-4o
        const conversationHistory = await DatabaseService.buildConversationContext(conversation.id, userId);
        context.log(`Conversation history: ${conversationHistory.length} messages`);

        // German tutor prompt optimized for voice
        const prompt = `Du bist ein freundlicher deutscher Sprachtutor für natürliche Konversation (B1-B2 Niveau).

PERSÖNLICHKEIT:
- Freundlich, geduldig und sympathisch
- Natürlich gesprächig wie ein echter Deutscher
- Verwende gelegentlich: "Also", "Na ja", "Genau", "Ach so"
- Zeige echtes Interesse am Gespräch

KONVERSATION:
- IMMER nur auf Deutsch antworten
- Kurze, natürliche Antworten (1-3 Sätze)
- Stelle Folgefragen um das Gespräch fortzusetzen
- Reagiere natürlich: "Interessant!", "Wirklich?", "Das kann ich verstehen"

FEHLERKORREKTUR - SEHR WICHTIG:
- Korrigiere NICHT ständig - das stört den Gesprächsfluss
- Korrigiere nur bei wichtigen Fehlern oder wenn es das Verständnis beeinträchtigt
- Wenn du korrigierst: Nur die falsche Stelle erwähnen, nicht den ganzen Satz wiederholen
- Freundlich korrigieren: "Kleiner Tipp: man sagt..." oder "Genau, nur heißt es..."
- Dann sofort mit dem normalen Gespräch weitermachen

AUDIO-OPTIMIERT:
- Keine Emojis, Smilies, Klammern, Asterisken oder andere Symbole
- Nur normale Satzzeichen für natürliche Sprechpausen
- Schreibe Wörter so wie sie gesprochen werden

THEMEN: Alltag, Arbeit, Reisen, deutsche Kultur, Pläne, Hobbys.

Führe eine fließende, natürliche Konversation - korrigiere nur wenn nötig, nicht bei jedem kleinen Fehler.`;

        const messages = [
            { role: 'system', content: prompt },
            ...conversationHistory
        ];

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
            throw new Error(`OpenAI API failed: ${openaiResponse.status} ${openaiResponse.statusText}`);
        }

        const openaiData = await openaiResponse.json();
        const germanResponse = openaiData.choices[0]?.message?.content || 'Entschuldigung, ich konnte nicht antworten.';

        context.log(`OpenAI response: ${germanResponse}`);

        // Clean response for speech synthesis
        const cleanResponse = germanResponse
            .replace(/[^a-zA-Z0-9äöüÄÖÜß\s.,?!:;'-]/g, '') // Eliminar símbolos no pronunciables, mantener puntuación esencial
            .replace(/\s+/g, ' ') // Reemplazar múltiples espacios con uno solo
            .trim();

        // STEP 2: Generate TTS with corrected Speech Services
        context.log('Step 2: Generating TTS audio...');

        const ssml = `
            <speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="de-DE">
                <voice name="de-DE-KatjaNeural">
                    <prosody rate="1.15" pitch="+2%">
                        <break time="200ms"/>
                        ${cleanResponse}
                        <break time="300ms"/>
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

        // STEP 3: Add tutor response to conversation
        await DatabaseService.addExchangeToConversation(conversation.id, userId, {
            speaker: 'tutor',
            transcript: cleanResponse,
            language: 'de'
        });

        context.log('Tutor response added to conversation');

        // STEP 4: Return complete response
        context.res = {
            status: 200,
            headers: corsHeaders,
            body: {
                success: true,
                germanResponse: cleanResponse,
                audioData: audioData,
                transcript: transcript,
                voiceUsed: 'de-DE-KatjaNeural',
                sessionId: currentSessionId,
                conversationId: conversation.id,
                timestamp: new Date().toISOString(),
                pipeline: 'OpenAI + TTS integrated + Memory',
                memoryEnabled: true,
                conversationLength: conversationHistory.length
            }
        };

        context.log('Voice conversation completed successfully');

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