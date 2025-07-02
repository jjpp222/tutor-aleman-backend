module.exports = function (context, req) {
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
        context.done();
        return;
    }

    try {
        const { transcript } = req.body || {};

        context.res = {
            status: 200,
            headers: corsHeaders,
            body: {
                success: true,
                germanResponse: "Hallo! Ich bin dein Deutschtutor. Wie geht es dir?",
                explanation: "¡Hola! Soy tu tutor de alemán. ¿Cómo estás?",
                transcript: transcript || "test",
                sessionId: "demo",
                timestamp: new Date().toISOString()
            }
        };

    } catch (error) {
        context.res = {
            status: 500,
            headers: corsHeaders,
            body: {
                success: false,
                error: "Error interno"
            }
        };
    }

    context.done();
};