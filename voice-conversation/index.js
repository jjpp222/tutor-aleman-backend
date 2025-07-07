const fetch = require('node-fetch');

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

        // Advanced German tutor prompt with pedagogical techniques for oral improvement
        const prompt = `Du bist ein erfahrener deutscher Sprachtutor mit pädagogischer Expertise für Sprechpraxis (B1-B2 Niveau).

KERNZIEL: Förderung der mündlichen Sprachkompetenz durch authentische Gespräche.

PÄDAGOGISCHE TECHNIKEN FÜR SPRECHFÖRDERUNG:
- GESPRÄCHSIMPULSE: Nutze offene Fragen um Sprechen zu fördern: "Erzähl mir mehr davon", "Wie war das für dich?", "Was denkst du über...?"
- ERWEITERTE ANTWORTEN: Ermutige längere Äußerungen: "Das ist interessant - kannst du das genauer erklären?"
- WORTSCHATZERWEITERUNG: Führe neue Wörter natürlich ein: "Das nennt man übrigens auch..." / "Ein anderes Wort dafür ist..."
- REFORMULIERUNG: Wiederhole Schüleraussagen in korrekter Form: "Ach so, du meinst also..."

SPRECHFÖRDERUNG & MOTIVATION:
- ERMUTIGUNG: "Du sprichst schon sehr gut!", "Deine Aussprache wird immer besser!"
- GEDULD: Bei Fehlern warten, nicht sofort korrigieren
- POSITIVE VERSTÄRKUNG: Erfolge hervorheben bevor Verbesserungen genannt werden
- SPRECHANGST REDUZIEREN: "Keine Sorge, Fehler sind völlig normal beim Lernen"

INTELLIGENTE FEHLERKORREKTUR (DOSIERT):
- Korrigiere SELEKTIV: Nur wenn 3+ kleine Fehler ODER 1 schwerwiegender Fehler
- SANFTE KORREKTUR: "Gut gesagt! Man könnte auch sagen..." / "Fast richtig - es heißt..."
- KORREKTUR MIT KONTEXT: "In Deutschland sagen wir normalerweise..."
- POSITIVE FORMULIERUNG: Nie "Das ist falsch" - immer "Noch besser wäre..."

KONVERSATIONSTECHNIKEN:
- NATÜRLICHE REAKTIONEN: "Ach so!", "Wirklich?", "Das kann ich gut verstehen"
- GESPRÄCHSFLUSS: Verwende Übergänge: "Apropos...", "Das erinnert mich an...", "Übrigens..."
- AKTIVES ZUHÖREN: "Das hört sich spannend an", "Verstehe ich richtig, dass...?"
- MEINUNGSAUSTAUSCH: "Ich sehe das ähnlich", "Da habe ich andere Erfahrungen gemacht"

KULTURVERMITTLUNG:
- Deutsche Perspektiven teilen: "Bei uns in Deutschland ist das so..."
- Kulturelle Unterschiede erklären: "Das ist typisch deutsch..."
- Alltagssprache vermitteln: Redewendungen und umgangssprachliche Ausdrücke

GESPRÄCHSFÜHRUNG FÜR LERNEFFEKT:
- THEMENVIELFALT: Alltag, Beruf, Reisen, deutsche Kultur, persönliche Erfahrungen
- SCHWIERIGKEITSANPASSUNG: Komplexität an Sprachniveau anpassen
- WIEDERHOLUNG: Wichtige Strukturen und Vokabeln natürlich wiederholen

AUDIO-OPTIMIERT:
- Keine Symbole, Emojis oder Klammern
- Natürliche Satzzeichen für Sprechrhythmus
- Klare, aussprechbare Sprache

Führe authentische Gespräche wie ein geduldiger Freund, der beim Deutschlernen hilft. Fokus auf Sprechpraxis, nicht auf Perfektion.`;

        const messages = [
            { role: 'system', content: prompt },
            { role: 'user', content: transcript.trim() }
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

        // STEP 2: Generate intelligent adaptive TTS
        context.log('Step 2: Generating adaptive TTS audio...');

        // Generate intelligent SSML based on response content
        const ssml = generateIntelligentSSML(cleanResponse);

        // Function to create adaptive SSML
        function generateIntelligentSSML(response) {
            // Analyze response content for intelligent adaptation
            const hasCorrection = /kleiner tipp|nur heißt es|man sagt|übrigens/i.test(response);
            const hasQuestion = /\?/.test(response);
            const hasCulturalRef = /in deutschland|deutsche|kultur/i.test(response);
            const hasEmpathy = /verstehe ich|nicht einfach|kenne ich/i.test(response);
            const isShort = response.length < 50;
            const isLong = response.length > 100;
            
            // Determine speech rate based on content type (optimized for natural conversation)
            let rate = "1.35"; // Default rate - more natural speed
            if (hasCorrection) rate = "1.2";      // Slower for corrections but not too slow
            else if (hasCulturalRef) rate = "1.25"; // Slightly slower for cultural info
            else if (isShort) rate = "1.4";        // Faster for short responses
            else if (isLong) rate = "1.3";         // Slightly slower for longer responses
            
            // Determine pitch variation
            let pitch = "+2%";
            if (hasEmpathy) pitch = "+1%";         // Warmer tone for empathy
            else if (hasQuestion) pitch = "+3%";   // Higher for questions
            
            // Process response with intelligent pauses and emphasis
            let processedResponse = response;
            
            // Add strategic pauses
            processedResponse = processedResponse
                // Pause before corrections
                .replace(/(kleiner tipp|nur heißt es|man sagt)/gi, '<break time="400ms"/>$1')
                // Pause after corrections before continuing
                .replace(/(kleiner tipp[^.!?]*[.!?])/gi, '$1<break time="500ms"/>')
                // Pause before cultural explanations
                .replace(/(in deutschland)/gi, '<break time="300ms"/>$1')
                // Pause after questions for thinking time
                .replace(/\?/g, '?<break time="600ms"/>')
                // Pause at sentence boundaries for natural flow
                .replace(/\. /g, '.<break time="350ms"/> ')
                // Pause after empathetic phrases
                .replace(/(das verstehe ich|das ist nicht einfach)/gi, '$1<break time="400ms"/>');
            
            // Add emphasis for important words
            processedResponse = processedResponse
                // Emphasize corrections
                .replace(/(kleiner tipp|nur heißt es|man sagt)/gi, '<emphasis level="moderate">$1</emphasis>')
                // Emphasize cultural references
                .replace(/(in deutschland|deutsche)/gi, '<emphasis level="moderate">$1</emphasis>')
                // Emphasize positive feedback
                .replace(/(gut|perfekt|genau|richtig)/gi, '<emphasis level="moderate">$1</emphasis>');
            
            return `
                <speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="de-DE">
                    <voice name="de-DE-KatjaNeural">
                        <prosody rate="${rate}" pitch="${pitch}">
                            <break time="200ms"/>
                            ${processedResponse}
                            <break time="400ms"/>
                        </prosody>
                    </voice>
                </speak>
            `;
        }

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
            headers: corsHeaders,
            body: {
                success: true,
                germanResponse: cleanResponse,
                audioData: audioData,
                transcript: transcript,
                voiceUsed: 'de-DE-KatjaNeural',
                sessionId: `voice_${Date.now()}`,
                timestamp: new Date().toISOString(),
                pipeline: 'OpenAI + TTS integrated'
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