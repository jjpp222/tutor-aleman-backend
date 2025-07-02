const fetch = require('node-fetch');
const { config, logWithContext, handleCorsPrelight, createErrorResponse, createSuccessResponse, validateInput } = require('../shared/utils');

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
    logWithContext(context, 'info', 'Test Chat request received');

    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        handleCorsPrelight(context);
        return;
    }

    try {
        // Validate configuration
        config.validate();

        // Parse and validate input
        const { message } = req.body || {};
        const validationErrors = validateInput({ message }, ['message']);
        
        if (validationErrors.length > 0) {
            context.res = createErrorResponse(400, 'Invalid input', validationErrors);
            return;
        }

        // Prepare messages for Azure AI
        const messages = [
            { role: 'system', content: TUTOR_SYSTEM_PROMPT },
            { role: 'user', content: message.trim() }
        ];

        logWithContext(context, 'info', 'Sending request to Azure OpenAI');

        // Call Azure OpenAI
        const openaiResponse = await fetch(`${config.openai.endpoint}/openai/deployments/${config.openai.deploymentName}/chat/completions?api-version=2024-02-15-preview`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'api-key': config.openai.key
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
            logWithContext(context, 'error', 'Azure OpenAI API error', errorText);
            throw new Error(`Azure OpenAI API failed: ${openaiResponse.status} ${openaiResponse.statusText}`);
        }

        const openaiData = await openaiResponse.json();
        const aiResponse = openaiData.choices[0]?.message?.content || 'Entschuldigung, ich konnte keine Antwort generieren.';

        logWithContext(context, 'info', 'Azure OpenAI response received successfully');

        context.res = createSuccessResponse({
            message: aiResponse
        });

    } catch (error) {
        logWithContext(context, 'error', 'Test Chat error', error.message);
        context.res = createErrorResponse(500, error.message);
    }
};