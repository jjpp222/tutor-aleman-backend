const fetch = require('node-fetch');
const { requireStudent } = require('../shared/auth');

// ===== CONSTANTS =====
const MAX_TOKENS = 150;
const MAX_HISTORY_MESSAGES = 20;
const DEFAULT_REGION = 'swedencentral';
const DEFAULT_DEPLOYMENT = 'gpt-4o';
const SESSION_CLEANUP_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours

// ===== SESSION MANAGEMENT =====
// In-memory session storage (in production, use Redis or CosmosDB)
let conversationSessions = new Map();
let lastCleanup = Date.now();

// Clean up old sessions periodically
function cleanupOldSessions() {
    const now = Date.now();
    if (now - lastCleanup > SESSION_CLEANUP_INTERVAL) {
        // Remove sessions older than 24 hours
        for (const [sessionId, data] of conversationSessions.entries()) {
            if (now - data.lastAccess > SESSION_CLEANUP_INTERVAL) {
                conversationSessions.delete(sessionId);
            }
        }
        lastCleanup = now;
    }
}

module.exports = async function (context, req) {
    context.log('Voice conversation with GPT-4o and Azure TTS');

    try {
        // ===== AUTHENTICATION =====
        const isAuthenticated = await requireStudent(context, req);
        if (!isAuthenticated) {
            return; // Response already set by middleware
        }

        const user = req.user;
        context.log(`Voice conversation request from student: ${user.email}`);
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

        // ===== SESSION MANAGEMENT =====
        cleanupOldSessions();
        
        // Generate session ID if not provided
        const currentSessionId = sessionId || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Get or create conversation history for this session
        let sessionData = conversationSessions.get(currentSessionId) || { 
            history: [], 
            created: Date.now(),
            lastAccess: Date.now()
        };
        
        // Update last access time
        sessionData.lastAccess = Date.now();
        
        // Use frontend-provided history if available (for state sync)
        let sessionHistory = conversationHistory.length > 0 ? conversationHistory : sessionData.history;

        context.log(`Processing transcript: ${transcript}`);

        // ===== CONFIGURATION =====
        const config = {
            openai: {
                endpoint: process.env.AZURE_OPENAI_ENDPOINT,
                key: process.env.AZURE_OPENAI_KEY,
                deployment: process.env.AZURE_OPENAI_DEPLOYMENT_NAME || DEFAULT_DEPLOYMENT,
                apiVersion: '2024-02-15-preview'
            },
            speech: {
                key: process.env.AZURE_SPEECH_KEY,
                region: process.env.AZURE_SPEECH_REGION || DEFAULT_REGION
            }
        };
        
        // ===== VOICE CONFIGURATION =====
        const voiceConfig = {
            voices: {
                premium: 'de-DE-SeraphinaMultilingualNeural',
                standard: 'de-DE-AmalaNeural',
                alternative: 'de-DE-SabineNeural'
            },
            prosody: {
                rate: '0.8',
                pitch: '0%',
                volume: '+5%',
                contour: '(0%,+5Hz) (50%,+8Hz) (100%,+3Hz)',
                style: 'conversational',
                styleDegree: '0.5'
            },
            outputFormat: 'riff-24khz-16bit-mono-pcm'
        };
        
        const selectedVoice = voiceConfig.voices.standard;

        // ===== VALIDATION =====
        if (!config.openai.endpoint || !config.openai.key) {
            throw new Error('Azure OpenAI credentials not configured');
        }
        
        if (!config.speech.key) {
            throw new Error('Azure Speech Services key not configured');
        }

        context.log(`Session: ${currentSessionId}, Messages: ${sessionHistory.length}`);
        context.log(`OpenAI: ${config.openai.endpoint}, Speech: ${config.speech.region}`);

        // ===== AI PROMPT CONFIGURATION =====
        const systemPrompt = `Du bist ein professioneller Deutschlehrer für Konversation auf B1-B2 Niveau.

WICHTIGE REGELN:
- Antworte IMMER NUR auf Deutsch
- Halte Antworten kurz (maximal 2-3 Sätze)
- Passe dein Niveau an den Schüler an
- Korrigiere Fehler natürlich im Gespräch
- Bei schweren Fehlern: kurze Korrektur auf Deutsch
- Sei geduldig und motivierend
- Verwende B1-B2 Wortschatz

THEMEN: Alltag, Arbeit, Reisen, deutsche Kultur, Pläne, Hobbys.

Antworte natürlich und gesprächig wie ein geduldiger deutscher Muttersprachler.`;

        // ===== BUILD CONVERSATION CONTEXT =====
        const messages = [
            { role: 'system', content: systemPrompt },
            ...sessionHistory,
            { role: 'user', content: transcript.trim() }
        ];
        
        const currentUserMessage = { role: 'user', content: transcript.trim() };

        // ===== STEP 1: GENERATE AI RESPONSE =====
        context.log('Step 1: Calling OpenAI API...');
        
        const openaiRequestBody = {
            messages: messages,
            max_tokens: MAX_TOKENS,
            temperature: 0.7,
            top_p: 0.9,
            frequency_penalty: 0.2,
            presence_penalty: 0.1
        };
        
        const openaiResponse = await fetch(
            `${config.openai.endpoint}/openai/deployments/${config.openai.deployment}/chat/completions?api-version=${config.openai.apiVersion}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'api-key': config.openai.key
                },
                body: JSON.stringify(openaiRequestBody)
            }
        );

        context.log(`OpenAI Response status: ${openaiResponse.status}`);

        if (!openaiResponse.ok) {
            const errorText = await openaiResponse.text();
            context.log(`OpenAI Error: ${errorText}`);
            throw new Error(`OpenAI API failed: ${openaiResponse.status} - ${errorText}`);
        }

        const openaiData = await openaiResponse.json();
        const germanResponse = openaiData.choices[0]?.message?.content || 'Entschuldigung, ich konnte nicht antworten.';

        context.log(`OpenAI response: ${germanResponse}`);
        
        // ===== UPDATE CONVERSATION HISTORY =====
        const assistantMessage = { role: 'assistant', content: germanResponse };
        sessionHistory.push(currentUserMessage, assistantMessage);
        
        // Limit history to prevent token overflow
        if (sessionHistory.length > MAX_HISTORY_MESSAGES) {
            sessionHistory = sessionHistory.slice(-MAX_HISTORY_MESSAGES);
        }
        
        // Update session data
        sessionData.history = sessionHistory;
        sessionData.lastAccess = Date.now();
        conversationSessions.set(currentSessionId, sessionData);

        // ===== CLEAN TEXT FOR TTS =====
        function cleanTextForTTS(text) {
            return text
                // Remove emojis and special characters
                .replace(/[\u{1F600}-\u{1F64F}]/gu, '') // Emoticons
                .replace(/[\u{1F300}-\u{1F5FF}]/gu, '') // Misc symbols
                .replace(/[\u{1F680}-\u{1F6FF}]/gu, '') // Transport
                .replace(/[\u{1F1E0}-\u{1F1FF}]/gu, '') // Flags
                .replace(/[\u{2600}-\u{26FF}]/gu, '')   // Misc symbols
                .replace(/[\u{2700}-\u{27BF}]/gu, '')   // Dingbats
                // Normalize whitespace
                .replace(/\s+/g, ' ')
                .trim();
        }
        
        const cleanResponse = cleanTextForTTS(germanResponse);

        // ===== STEP 2: GENERATE TTS AUDIO =====
        context.log('Step 2: Generating TTS audio...');
        
        function generateSSML(text, voice, prosody) {
            return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="de-DE">
                <voice name="${voice}">
                    <prosody rate="${prosody.rate}" pitch="${prosody.pitch}" volume="${prosody.volume}" contour="${prosody.contour}">
                        <express-as style="${prosody.style}" styledegree="${prosody.styleDegree}">
                            ${text}
                        </express-as>
                    </prosody>
                </voice>
            </speak>`;
        }
        
        const ssml = generateSSML(cleanResponse, selectedVoice, voiceConfig.prosody);
        
        const ttsResponse = await fetch(
            `https://${config.speech.region}.tts.speech.microsoft.com/cognitiveservices/v1`,
            {
                method: 'POST',
                headers: {
                    'Ocp-Apim-Subscription-Key': config.speech.key,
                    'Content-Type': 'application/ssml+xml',
                    'X-Microsoft-OutputFormat': voiceConfig.outputFormat,
                    'User-Agent': 'TutorAleman/1.0'
                },
                body: ssml
            }
        );

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

        // ===== STEP 3: RETURN RESPONSE =====
        const responseData = {
            success: true,
            germanResponse: cleanResponse,
            audioData: audioData,
            transcript: transcript.trim(),
            
            // Session info
            sessionId: currentSessionId,
            conversationHistory: sessionHistory,
            messageCount: sessionHistory.length,
            
            // Technical info
            voiceUsed: audioData ? selectedVoice : 'No Audio',
            pipeline: audioData ? 'GPT-4o + Azure TTS' : 'GPT-4o only',
            timestamp: new Date().toISOString(),
            
            // Performance metrics
            sessionCount: conversationSessions.size
        };
        
        context.res = {
            status: 200,
            body: responseData
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