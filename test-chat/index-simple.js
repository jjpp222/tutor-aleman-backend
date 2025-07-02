module.exports = async function (context, req) {
    context.log('Test chat endpoint called');

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
        context.res = {
            status: 200,
            headers: corsHeaders,
            body: {
                success: true,
                message: "Test chat endpoint working",
                status: "AI connection OK",
                timestamp: new Date().toISOString()
            }
        };
    } catch (error) {
        context.log.error('Test chat error:', error);
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