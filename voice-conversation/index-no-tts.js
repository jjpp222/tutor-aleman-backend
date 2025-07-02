const fetch = require('node-fetch');

module.exports = async function (context, req) {
    context.log('Voice conversation without TTS for testing');

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

        // Test OpenAI API call
        const openaiEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
        const openaiKey = process.env.AZURE_OPENAI_KEY;
        const deploymentName = process.env.AZURE_OPENAI_DEPLOYMENT_NAME || 'SprachMeister-GPT4o';

        if (!openaiEndpoint || !openaiKey) {
            throw new Error('OpenAI credentials not configured');
        }

        context.log(`OpenAI Endpoint: ${openaiEndpoint}`);
        context.log(`Deployment: ${deploymentName}`);
        context.log(`OpenAI Key configured: ${openaiKey ? 'YES' : 'NO'}`);

        // German tutor prompt
        const prompt = `Eres un tutor profesional de alemán especializado en conversación oral para niveles B1 y B2.

IMPORTANTE: 
- SIEMPRE responde ÚNICAMENTE en alemán
- Mantén respuestas cortas (máximo 2-3 frases)
- Adapta tu nivel al estudiante
- Corrige errores de forma natural en la conversación
- Sé paciente y motivador
- Usa vocabulario apropiado para B1-B2

Responde de forma natural y conversacional como un tutor nativo alemán paciente.`;

        const messages = [
            { role: 'system', content: prompt },
            { role: 'user', content: transcript.trim() }
        ];

        context.log('Calling OpenAI API...');
        
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

        context.res = {
            status: 200,
            headers: corsHeaders,
            body: {
                success: true,
                germanResponse: germanResponse,
                audioData: null, // Sin TTS por ahora
                transcript: transcript,
                voiceUsed: 'de-DE-KatjaNeural',
                sessionId: `test_${Date.now()}`,
                timestamp: new Date().toISOString(),
                note: 'TTS disabled for testing - fix Speech Services key first'
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