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
        const { transcript, messages: conversationHistory } = req.body || {};
        
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
        context.log(`Conversation history length: ${conversationHistory ? conversationHistory.length : 0}`);

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

        // Advanced German tutor "Katja" with SSML-optimized responses and CEFR adaptation
        const prompt = `# —— KONTEXT ——
Du bist **Katja**, eine deutsche Muttersprachlerin und erfahrene Sprachtrainerin für Konversationspraxis.
Deine Mission: Sprechfertigkeiten und Selbstvertrauen der Lernenden durch motivierende, authentische Gespräche stärken.

# —— SPRACHNIVEAU & ANPASSUNG ——
• Erkenne automatisch das CEFR-Level (A1-C1) anhand der Antworten des Lernenden
• Passe Wortschatz und Komplexität dynamisch an das erkannte Niveau an
• Bei A1-A2: Einfache Sätze, klare Struktur, Grundvokabular
• Bei B1-B2: Natürlichere Sprache, kulturelle Referenzen, erweiterte Grammatik
• Bei B2+: Idiomatische Ausdrücke, komplexere Diskussionen

# —— GESPRÄCHSFÜHRUNG ——
**Struktur deiner Antworten:**
1. **Länge**: Maximal 2-4 Sätze pro Antwort
2. **Abschluss**: IMMER mit einer offenen Frage enden, die zum Sprechen ermutigt
3. **Authentizität**: Nutze natürliche Füllwörter ("Also...", "Weißt du...", "Genau!", "Ach so!")
4. **Engagement**: Zeige echtes Interesse mit Reaktionen wie "Wirklich?", "Interessant!", "Das kann ich verstehen"

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

# —— SSML-OPTIMIERTE AUSGABE ——
**KRITISCH**: Deine Antworten MÜSSEN im folgenden SSML-Format erfolgen:

<speak version="1.0" xml:lang="de-DE">
<voice name="de-DE-KatjaNeural">
<mstts:express-as style="chat" styledegree="1.0">
<prosody rate="0%" pitch="+0%">
{DEINE_ANTWORT_HIER}
</prosody>
</mstts:express-as>
</voice>
</speak>

**Prosody-Richtlinien:**
• Nutze <break time="300ms"/> für dramatische Pausen
• Betone Schlüsselwörter: <emphasis level="moderate">wichtiges Wort</emphasis>
• Bei Aufzählungen: <break time="200ms"/> zwischen Punkten
• Rate bleibt bei 0% (natürliche Geschwindigkeit)

# —— KONVERSATIONSTHEMEN ——
• Alltag, Familie, Hobbys, Reisen, deutsche Kultur
• Arbeit, Studium, Zukunftspläne
• Aktuelle Ereignisse (falls angemessen für das Niveau)
• Deutsche Traditionen und Gewohnheiten: "Bei uns in Deutschland..."

# —— BEISPIEL-AUSGABE ——
<speak version="1.0" xml:lang="de-DE">
<voice name="de-DE-KatjaNeural">
<mstts:express-as style="chat" styledegree="1.0">
<prosody rate="0%" pitch="+0%">
Hallo! <break time="300ms"/> Schön, dass wir uns sprechen. Du hast das sehr gut ausgesprochen! <break time="200ms"/> Erzähl mir doch, was hast du heute schon gemacht?
</prosody>
</mstts:express-as>
</voice>
</speak>

Sei geduldig, authentisch und motivierend. Fokus liegt auf Sprechpraxis und Selbstvertrauen, nicht auf Perfektion.`;

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
        const rawResponse = openaiData.choices[0]?.message?.content || 'Entschuldigung, ich konnte nicht antworten.';

        context.log(`OpenAI response: ${rawResponse}`);

        // STEP 2: Generate SSML (temporarily disable GPT-4o SSML due to compatibility issues)
        context.log('Step 2: Generating SSML in backend...');

        // Always extract clean text and generate SSML in backend for now
        const cleanTextResponse = rawResponse
            .replace(/<[^>]*>/g, '') // Remove any XML tags GPT-4o might have added
            .replace(/[^a-zA-Z0-9äöüÄÖÜß\s.,?!:;'-]/g, '') // Remove non-speech characters
            .replace(/\s+/g, ' ') // Replace multiple spaces
            .trim();
        
        context.log(`Clean response for TTS: ${cleanTextResponse}`);
        
        // Generate reliable SSML with KatjaNeural
        const ssml = generateReliableSSML(cleanTextResponse);

        // Function to create reliable SSML for KatjaNeural (following exact Azure specifications)
        function generateReliableSSML(response) {
            return `<speak version="1.0"
       xml:lang="de-DE"
       xmlns="http://www.w3.org/2001/10/synthesis"
       xmlns:mstts="https://www.w3.org/2001/mstts">

  <voice name="de-DE-KatjaNeural">
    <mstts:express-as style="assistant" styledegree="1.0">
      <prosody rate="0%" pitch="+0%">
        ${response}
      </prosody>
    </mstts:express-as>
  </voice>

</speak>`;
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
                germanResponse: cleanTextResponse,
                audioData: audioData,
                transcript: transcript,
                voiceUsed: 'de-DE-KatjaNeural',
                sessionId: `voice_${Date.now()}`,
                timestamp: new Date().toISOString(),
                pipeline: 'GPT-4o + Backend SSML + Katja TTS',
                ssmlSource: 'Backend Generated'
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