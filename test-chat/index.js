// Azure OpenAI configuration
const AZURE_OPENAI_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT;
const AZURE_OPENAI_KEY = process.env.AZURE_OPENAI_KEY;
const AZURE_OPENAI_DEPLOYMENT_NAME = process.env.AZURE_OPENAI_DEPLOYMENT_NAME;

// German tutor system prompt
const TUTOR_SYSTEM_PROMPT = `Eres un tutor profesional de alemán especializado en niveles B1 y B2 del Marco Común Europeo de Referencia para las Lenguas.

Tu objetivo es ayudar a estudiantes de alemán a mejorar su:
- Fluidez en conversación
- Pronunciación
- Vocabulario
- Gramática
- Conectores y estructuras complejas

INSTRUCCIONES:
1. SIEMPRE responde en alemán, pero proporciona explicaciones en español cuando sea necesario para la comprensión
2. Adapta tu nivel al estudiante (B1-B2)
3. Corrige errores de forma amable y educativa
4. Proporciona contexto cultural cuando sea relevante
5. Usa conectores y estructuras que ayuden al estudiante a expresarse mejor
6. Mantén un tono motivador y paciente

TEMAS SUGERIDOS: vida cotidiana, trabajo, viajes, cultura alemana, actualidad, planes futuros.

¡Sé paciente, motivador y didáctico!`;

module.exports = async function (context, req) {
    context.log('Test Chat request received');

    // Set CORS headers
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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
        if (!AZURE_OPENAI_ENDPOINT || !AZURE_OPENAI_KEY || !AZURE_OPENAI_DEPLOYMENT_NAME) {
            context.log.error('Missing Azure OpenAI configuration');
            context.res = {
                status: 500,
                headers: corsHeaders,
                body: {
                    success: false,
                    error: 'Azure OpenAI not configured'
                }
            };
            return;
        }

        // Parse request body
        const { message } = req.body || {};

        // Validate input
        if (!message || message.trim().length === 0) {
            context.res = {
                status: 400,
                headers: corsHeaders,
                body: {
                    success: false,
                    error: 'Message is required'
                }
            };
            return;
        }

        // Prepare messages for Azure AI
        const messages = [
            { role: 'system', content: TUTOR_SYSTEM_PROMPT },
            { role: 'user', content: message.trim() }
        ];

        context.log('Sending request to Azure OpenAI...');

        // Call Azure OpenAI
        const openaiResponse = await fetch(`${AZURE_OPENAI_ENDPOINT}/openai/deployments/${AZURE_OPENAI_DEPLOYMENT_NAME}/chat/completions?api-version=2024-02-15-preview`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'api-key': AZURE_OPENAI_KEY
            },
            body: JSON.stringify({
                messages: messages,
                max_tokens: 800,
                temperature: 0.7,
                top_p: 0.9,
                frequency_penalty: 0.1,
                presence_penalty: 0.1
            })
        });

        if (!openaiResponse.ok) {
            const errorText = await openaiResponse.text();
            context.log.error('Azure OpenAI API error:', errorText);
            throw new Error(`Azure OpenAI API failed: ${openaiResponse.status} ${openaiResponse.statusText}`);
        }

        const openaiData = await openaiResponse.json();
        const aiResponse = openaiData.choices[0]?.message?.content || 'Entschuldigung, ich konnte keine Antwort generieren.';

        context.log('Azure OpenAI response received successfully');

        context.res = {
            status: 200,
            headers: corsHeaders,
            body: {
                success: true,
                message: aiResponse,
                timestamp: new Date().toISOString()
            }
        };

    } catch (error) {
        context.log.error('Test Chat error:', error.message);
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