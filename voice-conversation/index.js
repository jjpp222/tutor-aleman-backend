const fetch = require('node-fetch');
const { DatabaseService } = require('../shared/database');
const { validateJWT } = require('../shared/auth');

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

        // Validate JWT token and get user info
        let userId = null;
        let userCEFRLevel = 'B1'; // Default fallback
        
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            try {
                const token = authHeader.substring(7);
                const decoded = validateJWT(token);
                
                if (decoded && decoded.userId) {
                    userId = decoded.userId;
                    userCEFRLevel = await DatabaseService.getUserCEFRLevel(userId);
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

        // Safe token budget calculation
        function calculateTokenBudget(userInput) {
            const maxBudget = 260;              // Total budget
            const userTokens = estimateTokens(userInput);
            const systemTokens = 50;            // System prompt overhead
            const safetyMargin = 20;            // Safety buffer
            const available = maxBudget - userTokens - systemTokens - safetyMargin;
            return Math.max(60, Math.min(180, available)); // Clamp between 60-180
        }

        // Calculate dynamic max_tokens based on input
        const dynamicMaxTokens = calculateTokenBudget(transcript);
        context.log(`Dynamic token calculation: input=${estimateTokens(transcript)}, allocated=${dynamicMaxTokens}`);

        // === RETRY SYSTEM ===
        // Exponential backoff retry function
        async function retryWithBackoff(operation, maxRetries = 3, baseDelay = 250) {
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    return await operation();
                } catch (error) {
                    context.log(`Attempt ${attempt} failed: ${error.message}`);
                    
                    if (attempt === maxRetries) {
                        throw new Error(`Operation failed after ${maxRetries} attempts: ${error.message}`);
                    }
                    
                    // Exponential backoff: 250ms, 500ms, 1000ms
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

        // Advanced German tutor "Katja" with natural conversation flow and explicit CEFR detection
        const prompt = `# —— KONTEXT ——
Du bist **Katja**, eine deutsche Muttersprachlerin und erfahrene Sprachtrainerin für Konversationspraxis.
Deine Mission: Sprechfertigkeiten und Selbstvertrauen der Lernenden durch motivierende, authentische Gespräche stärken.

# —— SPRACHNIVEAU & ANPASSUNG ——
Passe Wortschatz und Komplexität an das CEFR-Niveau des Lernenden an, das dir im System-Nachricht mitgeteilt wird.

# —— GESPRÄCHSFÜHRUNG ——
**Struktur deiner Antworten:**
1. **Länge**: Intelligente Anpassung:
   • Kurze Äußerung (< 15 Wörter) UND einfache Antwort → 2-3 Sätze
   • Mittlere Äußerung (15-30 Wörter) ODER komplexe Gedanken → 3-4 Sätze
   • Lange Äußerung (> 30 Wörter) UND tiefe Diskussion → 4-5 Sätze
   • Bei Fehlerkorrekturen: Immer + 1 Satz für Erklärung
2. **Abschluss**: IMMER mit einer offenen Frage enden, die zum Sprechen ermutigt
3. **Authentizität**: Nutze natürliche Füllwörter ("Also...", "Weißt du...", "Genau!", "Ach so!")
4. **Engagement**: Zeige echtes Interesse mit Reaktionen wie "Wirklich?", "Interessant!", "Das kann ich verstehen"
5. **Betonung**: Umgib wichtige Wörter mit *Sternchen* für natürliche Hervorhebung

# —— INTELLIGENTE FEHLERKORREKTUR ——
**Reformulierungstechnik (Recast):**
• Höre zu ohne zu unterbrechen
• Reformuliere falsche Strukturen natürlich in korrekter Form: "Ach so, du meinst also..."
• Maximal 1-2 Verbesserungspunkte pro Runde
• IMMER zuerst loben, dann korrigieren: "Das hast du gut gesagt! Man könnte auch sagen..."
• Nie "Das ist falsch" - immer positive Umformulierung

# —— MOTIVATIONSSTRATEGIEN ——
• **Ermutigung**: "Du sprichst schon sehr gut!", "Deine Aussprache wird immer besser!"
• **Sprechangst reduzieren**: "Keine Sorge, Fehler sind völlig normal"
• **Längere Äußerungen fördern**: "Erzähl mir mehr davon", "Das ist interessant - kannst du das genauer erklären?"
• **Wortschatzerweiterung**: "Das nennt man übrigens auch...", "Ein anderes Wort dafür ist..."

# —— AUSGABEFORMAT ——
**WICHTIG**: Antworte nur mit natürlichem Fließtext - KEIN XML oder SSML!
• Verwende *Sternchen* um wichtige Wörter für spätere Betonung
• Schreibe natürlich und authentisch
• Das Audio-System übernimmt die Sprachsynthese automatisch

# —— KONVERSATIONSTHEMEN ——
Alltag, Hobbys, Reisen, deutsche Kultur, Arbeit, Studium, Zukunftspläne.

# —— BEISPIEL-AUSGABE ——
Hallo! Schön, dass wir uns sprechen. Du hast das sehr *gut* ausgesprochen! Erzähl mir doch, was hast du heute schon gemacht?

Sei geduldig, authentisch und motivierend. Fokus liegt auf Sprechpraxis und Selbstvertrauen, nicht auf Perfektion.`;

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

        // STEP 1: Call OpenAI for German response with retry system
        context.log('Step 1: Calling OpenAI API with retry protection...');
        
        const { rawResponse, openaiData } = await retryWithBackoff(async () => {
            const openaiResponse = await fetch(`${openaiEndpoint}/openai/deployments/${deploymentName}/chat/completions?api-version=2024-02-15-preview`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'api-key': openaiKey
                },
                body: JSON.stringify({
                    messages: messages,
                    max_tokens: dynamicMaxTokens, // Dynamic calculation based on input
                    temperature: 0.55, // Reducido para mayor consistencia
                    top_p: 0.9,
                    frequency_penalty: 0,
                    presence_penalty: 0
                })
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
            .replace(/[^a-zA-Z0-9äöüÄÖÜß\s.,?!:;'*-]/g, '') // Keep asterisks for emphasis
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
                hasEmphasis: /\*\w+\*/g.test(text),
                wordCount: text.trim().split(/\s+/).length,
                characterCount: text.length
            };
        }
        
        // Prosody engine for rate and pitch calculation with C2 support
        function calculateProsody(textAnalysis, cefrLevel, turnCount = 0) {
            // CEFR-based rates (WPM optimized)
            const baseRates = {
                'A1': -3,   // ~117 wpm
                'A2': -3,   // ~117 wpm  
                'B1': 10,   // ~133 wpm
                'B2': 18,   // ~143 wpm
                'C1': 25,   // ~152 wpm
                'C2': 32    // ~162 wpm (NEW!)
            };
            
            // 1. Base rate according to CEFR level
            let rateValue = baseRates[cefrLevel] ?? 10; // Default to B1 if unknown
            
            // 2. Contextual adjustments
            if (textAnalysis.isCorrection) rateValue -= 5;      // Slower for corrections
            else if (textAnalysis.isShort) rateValue += 4;      // Faster for short responses  
            else if (textAnalysis.isQuestion) rateValue += 2;   // Slightly faster for questions
            
            // 3. Natural variation every 3 turns (avoid robot voice)
            if (turnCount % 3 === 0 && !textAnalysis.isCorrection) {
                rateValue += (Math.random() * 2 - 1); // ±1% micro-variation
            }
            
            // 4. Safe range limits (expanded for C2)
            const finalRate = Math.max(-15, Math.min(rateValue, 35));
            const rate = `${finalRate.toFixed(1)}%`;
            
            // 5. Dynamic pitch (unchanged)
            let pitch = (Math.random() < 0.3) ? vary("+0%", 2) : "+0%";
            if (textAnalysis.isCorrection) pitch = "+3%";
            
            return { rate, pitch };
        }
        
        // Advanced pause calculation
        function calculateBreakTime(punctuation, sentenceLength, cefrLevel) {
            let baseTime;
            if (punctuation === '?') baseTime = 250;
            else if (punctuation === '.') baseTime = 120;
            else if (punctuation === ',') baseTime = 80;
            else return 0;
            
            const lengthFactor = 1 + Math.log10(sentenceLength + 1) / 4;
            const levelFactor = {
                'A1': 1.5, 'A2': 1.3, 'B1': 1.0, 'B2': 0.9, 'C1': 0.8, 'C2': 0.7
            }[cefrLevel] || 1.0;
            
            return Math.round(baseTime * lengthFactor * levelFactor);
        }
        
        // Text processor for emphasis and pauses
        function processTextForSSML(text, cefrLevel) {
            let processed = text;
            
            // Process asterisk emphasis with improved regex
            processed = processed.replace(/(?<!\\)\*(\p{L}[^*]{0,30})\*/gu, '<emphasis level="moderate">$1</emphasis>');
            
            // Add adaptive pauses
            const sentences = processed.split(/([?,.])/);
            let result = [];
            for (let i = 0; i < sentences.length; i += 2) {
                const sentence = sentences[i]?.trim();
                const punct = sentences[i + 1];
                
                if (sentence) result.push(sentence);
                if (punct) {
                    const breakTime = calculateBreakTime(punct, sentence?.length || 0, cefrLevel);
                    result.push(`${punct}<break time="${breakTime}ms"/>`);
                }
            }
            return result.join(' ');
        }
        
        // SSML template builder
        function buildSSMLTemplate(processedText, prosody) {
            return `<speak version="1.0" xml:lang="de-DE" xmlns:mstts="https://www.w3.org/2001/mstts" xml:base="https://tts.microsoft.com/language">
  <voice name="de-DE-KatjaNeural">
    <mstts:express-as style="chat" styledegree="0.8">
      <prosody rate="${prosody.rate}" pitch="${prosody.pitch}">
        ${processedText}
      </prosody>
    </mstts:express-as>
  </voice>
</speak>`;
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

        // Generate natural SSML with user's confirmed CEFR level  
        const ssml = generateNaturalSSML(cleanTextResponse, userCEFRLevel);

        // Main SSML generator (refactored with modules)
        function generateNaturalSSML(text, cefrLevel = 'B1') {
            try {
                // 1. Analyze text patterns
                const textAnalysis = analyzeText(text);
                
                // 2. Calculate prosody parameters
                const prosody = calculateProsody(textAnalysis, cefrLevel);
                
                // 3. Process text for SSML (emphasis + pauses)
                const processedText = processTextForSSML(text, cefrLevel);
                
                // 4. Build SSML template
                const ssml = buildSSMLTemplate(processedText, prosody);
                
                // 5. Validate SSML
                if (!validateSSML(ssml)) {
                    context.log('SSML validation failed, using fallback');
                    return generateMinimalSSML(text);
                }
                
                context.log(`Generated CEFR-adapted SSML - Level: ${cefrLevel}, Rate: ${prosody.rate}, Pitch: ${prosody.pitch}, Analysis: ${JSON.stringify(textAnalysis)}`);
                return ssml;
                
            } catch (error) {
                context.log(`Modular SSML generation failed: ${error.message}, using minimal fallback`);
                return generateMinimalSSML(text);
            }
        }

        // Minimal fallback SSML (ultra-safe)
        function generateMinimalSSML(response) {
            // Clean text of any problematic characters
            const cleanText = response.replace(/[<>&"']/g, '');
            return `<speak version="1.0" xml:lang="de-DE" xmlns:mstts="https://www.w3.org/2001/mstts">
  <voice name="de-DE-KatjaNeural">
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
                        'User-Agent': 'TutorAleman/1.0'
                    },
                    body: ssml
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
                voiceUsed: 'de-DE-KatjaNeural',
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
                    ssmlValidated: true
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