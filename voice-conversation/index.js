const fetch = require('node-fetch');
const https = require('https');
const http = require('http');

// Create persistent HTTP agents for connection pooling
const httpsAgent = new https.Agent({
    keepAlive: true,
    maxSockets: 10,
    maxFreeSockets: 5,
    timeout: 5000,
    keepAliveMsecs: 30000
});

const httpAgent = new http.Agent({
    keepAlive: true,
    maxSockets: 10,
    maxFreeSockets: 5,
    timeout: 5000,
    keepAliveMsecs: 30000
});
const { DatabaseService } = require('../shared/database');
const { validateJWT } = require('../shared/auth');
const { CacheService } = require('../shared/cache');

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
        const { transcript, messages: conversationHistory, sessionId } = req.body || {};
        
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

        // Validate JWT token and get user info (optimized - no DB calls)
        let userId = null;
        let userCEFRLevel = 'B1'; // Default fallback
        
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            try {
                const token = authHeader.substring(7);
                const decoded = validateJWT(token);
                
                if (decoded && decoded.userId) {
                    userId = decoded.userId;
                    userCEFRLevel = decoded.cefr || 'B1'; // Read directly from JWT claim (no DB call)
                    context.log(`User authenticated: ${userId}, CEFR Level: ${userCEFRLevel}`);
                } else {
                    context.log('Invalid token, using default level B1');
                }
            } catch (authError) {
                context.log('Auth validation failed, using default level B1:', authError.message);
            }
        } else {
            context.log('No authorization header, using default level B1');
        }

        context.log(`Processing transcript: ${transcript}`);
        context.log(`Conversation history length: ${conversationHistory ? conversationHistory.length : 0}`);
        context.log(`User CEFR Level: ${userCEFRLevel}`);

        // === UTILITY FUNCTIONS ===
        // Estimate tokens for dynamic max_tokens calculation
        function estimateTokens(text) {
            // Rough approximation: ~0.75 tokens per word for German
            const words = text.trim().split(/\s+/).length;
            return Math.ceil(words * 0.75);
        }

        // Advanced token budget calculation with conversation context - EXPANDED FOR COMPLETE RESPONSES
        function calculateTokenBudget(userInput, conversationLength = 0, cefrLevel = 'B1') {
            const maxBudget = 600;              // Significantly increased total budget
            const userTokens = estimateTokens(userInput);
            const systemTokens = 45;            // Optimized system prompt overhead
            const safetyMargin = 20;            // Slightly increased safety buffer
            
            // Dynamic allocation based on conversation length and CEFR level
            let contextBonus = 0;
            if (conversationLength > 5) contextBonus += 15;    // More context = more tokens
            if (cefrLevel === 'C1' || cefrLevel === 'C2') contextBonus += 50; // Advanced users get significantly more
            else if (cefrLevel === 'B1' || cefrLevel === 'B2') contextBonus += 25; // Intermediate users get more
            
            const available = maxBudget - userTokens - systemTokens - safetyMargin + contextBonus;
            return Math.max(120, Math.min(500, available)); // Expanded range: 120-500 (much more generous)
        }

        // Calculate dynamic max_tokens based on input and context
        const dynamicMaxTokens = calculateTokenBudget(transcript, conversationHistory?.length || 0, userCEFRLevel);
        context.log(`Advanced token calculation: input=${estimateTokens(transcript)}, allocated=${dynamicMaxTokens}, context=${conversationHistory?.length || 0}, level=${userCEFRLevel}`);

        // === RETRY SYSTEM ===
        // Optimized retry function for conversational AI
        async function retryWithBackoff(operation, maxRetries = 2, baseDelay = 100) {
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    return await operation();
                } catch (error) {
                    context.log(`Attempt ${attempt} failed: ${error.message}`);
                    
                    if (attempt === maxRetries) {
                        throw new Error(`Operation failed after ${maxRetries} attempts: ${error.message}`);
                    }
                    
                    // Faster retry: 100ms, 200ms instead of 250ms, 500ms, 1000ms
                    const delay = baseDelay * Math.pow(2, attempt - 1);
                    context.log(`Retrying in ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }

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

        // Advanced German tutor with natural conversation flow and explicit CEFR detection
        const prompt = `# —— KONTEXT ——
Du bist eine erfahrene deutsche Sprachtrainerin für Konversationspraxis.
Deine Mission: Sprechfertigkeiten und Selbstvertrauen der Lernenden durch motivierende, authentische Gespräche stärken.

# —— SPRACHNIVEAU & ANAPTACIÓN ——
Pase Wortschatz und Komplexität an das CEFR-Niveau des Lernenden an, das dir im System-Nachricht mitgeteilt wird.

# —— GESPRÄCHSFÜHRUNG ——
**Struktur deiner Antworten:**
1. **Länge**: Intelligente Anpassung (VOLLSTÄNDIGE Antworten):
   • Kurze Äußerung (< 15 Wörter) UND einfache Antwort → 2-3 vollständige Sätze
   • Mittlere Äußerung (15-30 Wörter) ODER komplexe Gedanken → 3-4 vollständige Sätze
   • Lange Äußerung (> 30 Wörter) UND tiefe Diskussion → 4-6 vollständige Sätze
   • Bei Fehlerkorrekturen: Immer + 1-2 zusätzliche Sätze für Erklärung
   • WICHTIG: Beende IMMER deine Gedanken vollständig. Keine abgeschnittenen Sätze!
2. **Abschluss**: IMMER mit einer offenen Frage enden, die zum Sprechen ermutigt
3. **Authentizität**: Nutze natürliche Füllwörter ("Also...", "Weißt du...", "Genau!", "Ach so!")
4. **Engagement**: Zeige echtes Interesse mit Reaktionen wie "Wirklich?", "Interessant!", "Das kann ich verstehen"
5. **Betonung**: Umgib wichtige Wörter mit *Sternchen* für natürliche Hervorhebung

# —— INTELLIGENTE FEHLERKORREKTUR ——
**Reformulierungstechnik (Recast):**
• Höre zu ohne zu unterbrechen
• Reformuliere falsche Strukturen natürlich in korrekter Form: "Ach so, du meinst also..."
• **Solo corrige errores significativos** que afecten la comprensión o la fluidez.
• **Prioriza la fluidez y la confianza** del alumno sobre la corrección gramatical perfecta.
• Máximo 1-2 puntos de mejora por turno, solo si son *realmente* necesarios.
• IMMER primero loben, luego corregir: "Das hast du gut gesagt! Man könnte auch sagen..."
• Nunca "Das ist falsch" - siempre reformulación positiva.

# —— MOTIVATIONSSTRATEGIEN ——
• **Ermutigung**: "Du sprichst schon sehr gut!", "Deine Aussprache wird immer besser!"
• **Sprechangst reduzieren**: "Keine Sorge, Fehler sind völlig normal"
• **Längere Äußerungen fördern**: "Erzähl mir mehr davon", "Das ist interessant - kannst du das genauer erklären?"
• **Wortschatzerweiterung**: "Das nennt man übrigens auch...", "Ein anderes Wort dafür ist..."

# —— KRITISCH: PERFEKTE PUNTUIERUNG ——
**ABSOLUT WICHTIG para naturalidad en la voz:**
• Usa TODOS los signos de puntuación necesarios: puntos, comas, exclamaciones, interrogaciones.
• Pon comas en enumeraciones: "Ich mag Kaffee, Tee, und Schokolade"
• Pon comas antes de "aber", "oder", "und" en oraciones subordinadas: "Das ist gut, aber es könnte besser sein"
• Termina CADA oración con un punto, exclamación o interrogación.
• Para pausas naturales, usa guiones largos (—) o asteriscos (*) que serán convertidos a pausas SSML.
• NUNCA entregues texto sin la puntuación correcta.

# —— FORMATO DE SALIDA ——
**IMPORTANTE**: Responde solo con texto fluido y natural - ¡NO XML o SSML!
• Usa *asteriscos* para palabras importantes que necesiten énfasis (serán convertidos a SSML).
• Escribe de forma natural y auténtica con PUNTUACIÓN PERFECTA.
• El sistema de audio se encarga de la síntesis de voz automáticamente.
• NUNCA respuestas cortadas o incompletas - ¡termina cada pensamiento por completo!

# —— TEMAS DE CONVERSACIÓN ——
Vida diaria, hobbies, viajes, cultura alemana, trabajo, estudios, planes futuros.

# —— EJEMPLO DE SALIDA ——
¡Hola! Qué bien que hablemos. Has pronunciado esto muy *bien*! Cuéntame, ¿qué has hecho hoy?`;

        // Create user profile message for consistent CEFR level awareness
        const profileMessage = {
            role: 'system',
            name: 'user-profile',
            content: `CEFR=${userCEFRLevel}`
        };

        const messages = [
            { role: 'system', content: prompt },
            profileMessage, // ← NUEVO: Always inject user's CEFR level
            ...(conversationHistory || []),
            { role: 'user', content: transcript.trim() }
        ];

        // Extract voice preference from request (default to Katja for backward compatibility)
        const selectedVoice = req.body.voiceId || 'de-DE-KatjaNeural';
        const availableVoices = {
            'de-DE-KatjaNeural': { name: 'Katja', gender: 'female', description: 'Amigable y educativa' },
            'de-DE-KlausNeural': { name: 'Klaus', gender: 'male', description: 'Natural y cálido' }
        };
        
        // Validate voice selection
        if (!availableVoices[selectedVoice]) {
            context.log(`Invalid voice selected: ${selectedVoice}, falling back to Katja`);
            selectedVoice = 'de-DE-KatjaNeural';
        }
        
        context.log(`Selected voice: ${selectedVoice} (${availableVoices[selectedVoice].name})`);

        // STEP 1: Call OpenAI for German response with retry system
        context.log('Step 1: Calling OpenAI API with retry protection...');
        
        const { rawResponse, openaiData } = await retryWithBackoff(async () => {
            const openaiResponse = await fetch(`${openaiEndpoint}/openai/deployments/${deploymentName}/chat/completions?api-version=2024-02-15-preview`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'api-key': openaiKey,
                    'Connection': 'keep-alive'
                },
                body: JSON.stringify({
                    messages: messages,
                    max_tokens: dynamicMaxTokens, // Advanced calculation with context
                    temperature: 0.50, // Reduced for consistency and speed
                    top_p: 0.85, // Reduced for faster generation
                    frequency_penalty: 0.1, // Slight penalty for repetition
                    presence_penalty: 0.05 // Slight penalty for word reuse
                }),
                agent: openaiEndpoint.startsWith('https://') ? httpsAgent : httpAgent,
                timeout: 8000 // 8 second timeout for OpenAI calls
            });

            context.log(`OpenAI Response status: ${openaiResponse.status}`);

            if (!openaiResponse.ok) {
                const errorText = await openaiResponse.text();
                context.log(`OpenAI Error: ${errorText}`);
                throw new Error(`OpenAI API failed: ${openaiResponse.status} ${openaiResponse.statusText}`);
            }

            const openaiData = await openaiResponse.json();
            const rawResponse = openaiData.choices[0]?.message?.content || 'Entschuldigung, ich konnte nicht antworten.';

            context.log(`OpenAI response: ${rawResponse}`);
            return { rawResponse, openaiData };
        });

        // STEP 2: Parse CEFR level and clean response
        context.log('Step 2: Parsing CEFR level and generating SSML...');

        // Extract CEFR level tag if present (now includes C2)
        const cefrMatch = rawResponse.match(/^<<(A1|A2|B1|B2|C1|C2)>>/);
        const detectedLevel = cefrMatch ? cefrMatch[1] : 'B1'; // Default to B1
        
        // Remove CEFR tag and clean text for TTS
        let cleanTextResponse = rawResponse
            .replace(/^<<(A1|A2|B1|B2|C1|C2)>>/, '') // Remove CEFR tag
            .replace(/<[^>]*>/g, '') // Remove any other XML tags
            .replace(/[^a-zA-Z0-9äöüÄÖÜß\s.,?!:;]/g, '') // Remove special chars, but keep punctuation for later processing
            .replace(/\s+/g, ' ') // Replace multiple spaces
            .trim();

        context.log(`Detected CEFR level: ${detectedLevel}`);
        context.log(`Clean response for TTS: ${cleanTextResponse}`);
        
        // === SSML GENERATION MODULES ===
        
        // Utility function for natural voice variation
        function vary(baseValue, range = 2) {
            // Returns baseValue ± range %
            const base = parseFloat(baseValue) || 0;
            const delta = (Math.random() * range * 2 - range);
            const result = base + delta;
            return `${result.toFixed(1)}%`;
        }
        
        // Text analysis and pattern detection
        function analyzeText(text) {
            return {
                isCorrection: /man könnte auch sagen|fast richtig|gut gesagt|noch besser wäre/i.test(text),
                isQuestion: /\?/.test(text),
                isShort: text.length < 50,
                isLong: text.length > 120,
                hasEmphasis: /\*\w+\*/g.test(text),
                wordCount: text.trim().split(/\s+/).length,
                characterCount: text.length
            };
        }
        
        // Prosody engine for rate and pitch calculation with C2 support and voice-specific optimization
        function calculateProsody(textAnalysis, cefrLevel, turnCount = 0, voiceName = 'de-DE-KatjaNeural') {
            // CEFR-based rates (WPM optimized)
            const baseRates = {
                'A1': -3,   // ~117 wpm
                'A2': -3,   // ~117 wpm  
                'B1': 10,   // ~133 wpm
                'B2': 18,   // ~143 wpm
                'C1': 20,   // ~145 wpm (Reduced for more natural pace)
                'C2': 25    // ~152 wpm (Reduced for more natural pace)
            };
            
            // 1. Base rate according to CEFR level
            let rateValue = baseRates[cefrLevel] ?? 10; // Default to B1 if unknown
            
            // 2. Voice-specific adjustments for naturalness
            if (voiceName === 'de-DE-KlausNeural') {
                // Klaus Neural v2: more human-like speed adjustments
                rateValue += 1; // Reduced from +3 to +1 for more natural pace
                if (textAnalysis.isQuestion) rateValue += 1; // Reduced from +2 to +1
                if (textAnalysis.isShort) rateValue += 2; // Reduced from +3 to +2
                if (textAnalysis.isCorrection) rateValue -= 1; // Slower for corrections
                if (textAnalysis.isLong) rateValue -= 2; // Slower for long texts
            }
            
            // 3. Contextual adjustments
            if (textAnalysis.isCorrection) rateValue -= 5;      // Slower for corrections
            else if (textAnalysis.isShort) rateValue += 4;      // Faster for short responses  
            else if (textAnalysis.isQuestion) rateValue += 2;   // Slightly faster for questions
            
            // 4. Natural variation every 3 turns (avoid robot voice)
            if (turnCount % 3 === 0 && !textAnalysis.isCorrection) {
                rateValue += (Math.random() * 2 - 1); // ±1% micro-variation
            }
            
            // 5. Safe range limits (expanded for C2)
            const finalRate = Math.max(-15, Math.min(rateValue, 35));
            const rate = `${finalRate.toFixed(1)}%`;
            
            // 6. Voice-specific pitch optimization  
            let pitch = "+0%";
            if (voiceName === 'de-DE-KlausNeural') {
                // Klaus Neural v2: more expressive and human pitch
                if (textAnalysis.isCorrection) {
                    pitch = "+0.8%"; // Gentle correction tone
                } else if (textAnalysis.isQuestion) {
                    pitch = `+${2.0 + Math.random() * 1.5}%`; // 2.0-3.5% variable questions
                } else if (textAnalysis.hasEmphasis) {
                    pitch = `+${1.5 + Math.random() * 2.0}%`; // 1.5-3.5% for emphasis
                } else if (textAnalysis.isShort) {
                    pitch = `+${0.5 + Math.random() * 1.0}%`; // 0.5-1.5% for short answers
                } else {
                    // Natural variation 60% of the time
                    if (Math.random() < 0.6) {
                        pitch = `${-0.5 + Math.random() * 2.0}%`; // -0.5% to +1.5%
                    }
                }
            } else {
                // Katja Neural (original configuration)
                if (textAnalysis.isCorrection) pitch = "+3%";
                else if (Math.random() < 0.3) pitch = vary("+0%", 2);
            }

            // 7. Volume calculation
            let volumeValue = 0; // Default to +0%
            if (voiceName === 'de-DE-KlausNeural') {
                // Klaus Neural v2: more expressive volume
                if (textAnalysis.hasEmphasis) volumeValue += 4; // Stronger for emphasis
                else if (textAnalysis.isQuestion) volumeValue += 2; // Clearer for questions
                else if (textAnalysis.isCorrection) volumeValue -= 1; // Softer for corrections
                else if (Math.random() < 0.3) volumeValue += Math.random() * 2; // Subtle variation
            } else {
                // Katja Neural
                if (textAnalysis.hasEmphasis) volumeValue += 4; // More pronounced for emphasis
            }
            const volume = `${volumeValue.toFixed(1)}%`;
            
            return { rate, pitch, volume };
        }
        
        // Advanced pause calculation with voice-specific optimization
        function calculateBreakStrength(punctuation, sentenceLength, cefrLevel, voiceName = 'de-DE-KatjaNeural') {
            let strength = 'none'; // Default

            if (punctuation === '?') {
                strength = 'strong';
            } else if (punctuation === '.') {
                strength = 'medium';
            } else if (punctuation === ',') {
                strength = 'weak';
            }

            // Optional: Adjust strength based on CEFR level for more natural flow
            // For lower levels (A1, A2), slightly stronger breaks might be helpful for clarity.
            // For higher levels (C1, C2), slightly weaker breaks for more fluent speech.
            if (cefrLevel === 'A1' || cefrLevel === 'A2') {
                if (strength === 'weak') strength = 'medium';
                else if (strength === 'medium') strength = 'strong';
            } else if (cefrLevel === 'C1' || cefrLevel === 'C2') {
                if (strength === 'medium') strength = 'weak';
                else if (strength === 'strong') strength = 'medium';
            }
            
            return strength;
        }
        
        // Text processor for emphasis and pauses
        function processTextForSSML(text, cefrLevel, voiceName = 'de-DE-KatjaNeural') {
            // 1) Escape XML characters from the raw text
            let processed = text
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;");
            
            // 2) Convert Markdown *emphasis* to SSML <emphasis>
            // Use 'strong' emphasis as requested
            processed = processed.replace(/\*(.+?)\*/g, (_, inner) =>
                `<emphasis level="strong">${inner.trim()}</emphasis>`
            );

            // 3) Replace punctuation with breaks - Klaus optimized v2
            if (voiceName === 'de-DE-KlausNeural') {
                // Klaus v2: variable, natural pauses
                processed = processed
                    // Periods/exclamations: 220-320ms (safer than 180ms)
                    .replace(/([.!]+)\s*/g, () => `<break time="${220 + Math.random() * 100}ms"/>`)
                    // Questions: 250-370ms 
                    .replace(/([?]+)\s*/g, () => `<break time="${250 + Math.random() * 120}ms"/>`)
                    // Commas: 90-150ms (very natural)
                    .replace(/(,)\s*/g, () => `<break time="${90 + Math.random() * 60}ms"/>`)
                    // Semicolons/colons: 160-240ms
                    .replace(/([;:]+)\s*/g, () => `<break time="${160 + Math.random() * 80}ms"/>`);
            } else {
                // Katja keeps original timing
                processed = processed
                    // periods and end-of-sentence punctuation
                    .replace(/([.?!]+)\s*/g, `<break time="400ms"/>`)
                    // commas and small pauses
                    .replace(/(,)\s*/g, `<break time="200ms"/>`);
            }

            // 4) Return the processed text with breaks
            return processed.trim();
        }
        
        // SSML template builder (voice-specific optimizations)
        function buildSSMLTemplate(processedText, prosody, voiceName) {
            // Klaus Neural v2: safe style selection with fallback
            if (voiceName === 'de-DE-KlausNeural') {
                // Use safe 'chat' style (more supported than 'conversational')
                const klausStyle = 'chat'; // Compatible with Klaus Neural
                return `<speak version="1.0" xml:lang="de-DE" xmlns:mstts="https://www.w3.org/2001/mstts" xml:base="https://tts.microsoft.com/language">
  <voice name="${voiceName}">
    <mstts:express-as style="${klausStyle}" styledegree="0.8">
      <prosody rate="${prosody.rate}" pitch="${prosody.pitch}" volume="${prosody.volume}">
        ${processedText}
      </prosody>
    </mstts:express-as>
  </voice>
</speak>`;
            } else {
                // Katja Neural (default configuration)
                return `<speak version="1.0" xml:lang="de-DE" xmlns:mstts="https://www.w3.org/2001/mstts" xml:base="https://tts.microsoft.com/language">
  <voice name="${voiceName}">
    <mstts:express-as style="chat" styledegree="0.8">
      <prosody rate="${prosody.rate}" pitch="${prosody.pitch}">
        ${processedText}
      </prosody>
    </mstts:express-as>
  </voice>
</speak>`;
            }
        }
        
        // Enhanced SSML validation
        function validateSSML(ssml) {
            try {
                // Basic structure check
                if (!ssml.includes('<speak') || !ssml.includes('</speak>')) {
                    throw new Error('Invalid SSML structure');
                }
                
                // Check for unescaped characters
                if (ssml.includes('&') && !ssml.includes('&amp;')) {
                    context.log('Warning: Unescaped ampersand detected in SSML');
                }
                
                // Check for balanced tags (basic)
                const openTags = (ssml.match(/<[^/][^>]*>/g) || []).length;
                const closeTags = (ssml.match(/<\/[^>]*>/g) || []).length;
                if (openTags !== closeTags) {
                    context.log('Warning: Potentially unbalanced SSML tags');
                }
                
                return true;
            } catch (error) {
                context.log(`SSML validation error: ${error.message}`);
                return false;
            }
        }

        // Check TTS cache first (voice-specific caching)
        const textHash = CacheService.hashText(cleanTextResponse);
        let cachedAudio = CacheService.getTTSAudio(textHash, selectedVoice, userCEFRLevel);
        
        if (cachedAudio) {
            context.log(`TTS cache hit for hash: ${textHash}`);
            // Return cached response immediately
            context.res = {
                status: 200,
                headers: corsHeaders,
                body: {
                    success: true,
                    germanResponse: cleanTextResponse,
                    audioData: cachedAudio,
                    transcript: transcript,
                    voiceUsed: selectedVoice,
                    sessionId: `voice_${Date.now()}`,
                    timestamp: new Date().toISOString(),
                    pipeline: 'GPT-4o + CEFR-Adaptive SSML + Cached TTS',
                    ssmlSource: 'Cached Audio',
                    detectedLevel: detectedLevel,
                    appliedLevel: userCEFRLevel,
                    tokenCalculation: {
                        inputTokens: estimateTokens(transcript),
                        allocatedTokens: dynamicMaxTokens,
                        budgetType: 'dynamic-safe',
                        efficiency: (estimateTokens(cleanTextResponse) / dynamicMaxTokens * 100).toFixed(1) + '%'
                    },
                    performance: {
                        hasAudio: true,
                        audioSize: Math.round(cachedAudio.length * 0.75),
                        ssmlValidated: true,
                        cacheHit: true
                    }
                }
            };
            return;
        }
        
        // Generate natural SSML with user's confirmed CEFR level and selected voice
        const ssml = generateNaturalSSML(cleanTextResponse, userCEFRLevel, selectedVoice);

        // Main SSML generator (refactored with modules)
        function generateNaturalSSML(text, cefrLevel = 'B1', voiceName = 'de-DE-KatjaNeural') {
            try {
                // 1. Analyze text patterns
                const textAnalysis = analyzeText(text);
                
                // 2. Calculate prosody parameters with voice-specific optimization
                const prosody = calculateProsody(textAnalysis, cefrLevel, 0, voiceName);
                
                // 3. Process text for SSML (emphasis + pauses)
                const processedText = processTextForSSML(text, cefrLevel, voiceName);
                
                // 4. Build SSML template with selected voice
                const ssml = buildSSMLTemplate(processedText, prosody, voiceName);
                
                // 5. Validate SSML
                if (!validateSSML(ssml)) {
                    context.log('SSML validation failed, using fallback');
                    return generateMinimalSSML(text, voiceName);
                }
                
                context.log(`Generated CEFR-adapted SSML - Voice: ${voiceName}, Level: ${cefrLevel}, Rate: ${prosody.rate}, Pitch: ${prosody.pitch}, Analysis: ${JSON.stringify(textAnalysis)}`);
                return ssml;
                
            } catch (error) {
                context.log(`Modular SSML generation failed: ${error.message}, using minimal fallback`);
                return generateMinimalSSML(text, voiceName);
            }
        }

        // Minimal fallback SSML (ultra-safe)
        function generateMinimalSSML(response, voiceName = 'de-DE-KatjaNeural') {
            // Clean text of any problematic characters
            const cleanText = response.replace(/[<>&"']/g, '');
            return `<speak version="1.0" xml:lang="de-DE" xmlns:mstts="https://www.w3.org/2001/mstts">
  <voice name="${voiceName}">
    <mstts:express-as style="chat" styledegree="0.8">
      <prosody rate="+0%" pitch="+0%">
        ${cleanText}
      </prosody>
    </mstts:express-as>
  </voice>
</speak>`;
        }

        // STEP 3: Generate TTS audio with retry protection
        context.log('Step 3: Generating TTS audio with retry protection...');
        
        let audioData = null;
        try {
            audioData = await retryWithBackoff(async () => {
                const ttsResponse = await fetch(`https://${speechRegion}.tts.speech.microsoft.com/cognitiveservices/v1`, {
                    method: 'POST',
                    headers: {
                        'Ocp-Apim-Subscription-Key': speechKey,
                        'Content-Type': 'application/ssml+xml',
                        'X-Microsoft-OutputFormat': 'riff-24khz-16bit-mono-pcm',
                        'User-Agent': 'TutorAleman/1.0',
                        'Connection': 'keep-alive'
                    },
                    body: ssml,
                    agent: httpsAgent,
                    timeout: 6000 // 6 second timeout for TTS calls
                });

                context.log(`TTS Response status: ${ttsResponse.status}`);

                if (!ttsResponse.ok) {
                    const errorText = await ttsResponse.text();
                    context.log(`TTS Error: ${errorText}`);
                    throw new Error(`TTS API failed: ${ttsResponse.status} ${ttsResponse.statusText}`);
                }

                const audioBuffer = await ttsResponse.arrayBuffer();
                const base64Audio = Buffer.from(audioBuffer).toString('base64');
                context.log(`TTS audio generated successfully, size: ${audioBuffer.byteLength} bytes`);
                
                // Cache the generated audio (voice-specific)
                CacheService.setTTSAudio(textHash, selectedVoice, userCEFRLevel, base64Audio);
                context.log(`TTS audio cached with hash: ${textHash} for voice: ${selectedVoice}`);
                
                return base64Audio;
            }, 2, 500); // Only 2 retries for TTS, longer delay
        } catch (ttsError) {
            context.log(`TTS generation failed after retries: ${ttsError.message}`);
            // Continue without audio - still return the text response
            audioData = null;
        }

        // STEP 4: Return complete response
        context.res = {
            status: 200,
            headers: corsHeaders,
            body: {
                success: true,
                germanResponse: cleanTextResponse,
                audioData: audioData,
                transcript: transcript,
                voiceUsed: selectedVoice,
                sessionId: `voice_${Date.now()}`,
                timestamp: new Date().toISOString(),
                pipeline: 'GPT-4o + CEFR-Adaptive SSML + Katja TTS v2.0',
                ssmlSource: 'Modular CEFR-Aware Engine',
                detectedLevel: detectedLevel, // AI-detected from response
                appliedLevel: userCEFRLevel,  // Actually used for TTS generation
                tokenCalculation: {
                    inputTokens: estimateTokens(transcript),
                    allocatedTokens: dynamicMaxTokens,
                    budgetType: 'dynamic-safe',
                    efficiency: (estimateTokens(cleanTextResponse) / dynamicMaxTokens * 100).toFixed(1) + '%'
                },
                prosodyInfo: {
                    ...analyzeText(cleanTextResponse),
                    detectedLevel: detectedLevel,
                    appliedLevel: userCEFRLevel,
                    style: 'chat',
                    styledegree: '0.8',
                    adaptivePauses: true,
                    naturalVariation: true,
                    retryProtection: true
                },
                performance: {
                    hasAudio: !!audioData,
                    audioSize: audioData ? Math.round(audioData.length * 0.75) : 0, // Approximate bytes
                    ssmlValidated: true,
                    cacheHit: false,
                    cacheStats: {
                        userProfiles: CacheService.getUserProfileStats(),
                        ttsAudio: CacheService.getTTSCacheStats()
                    }
                }
            }
        };

        context.log('Voice conversation completed successfully');

    } catch (error) {
        context.log.error('Voice conversation error:', error.message);
        context.log.error('Error stack:', error.stack);
        context.log.error('Error context:', {
            transcript: transcript?.substring(0, 100),
            historyLength: conversationHistory?.length || 0,
            timestamp: new Date().toISOString()
        });
        
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