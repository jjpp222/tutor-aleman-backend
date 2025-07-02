module.exports = function (context, req) {
    context.log('Hello endpoint called');
    
    const corsHeaders = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    };

    if (req.method === 'OPTIONS') {
        context.res = {
            status: 200,
            headers: corsHeaders
        };
        context.done();
        return;
    }

    try {
        context.res = {
            status: 200,
            headers: corsHeaders,
            body: {
                message: "TutorAleman Backend is running",
                status: "healthy",
                timestamp: new Date().toISOString(),
                version: "1.0.0"
            }
        };
    } catch (error) {
        context.log.error('Hello endpoint error:', error);
        context.res = {
            status: 500,
            headers: corsHeaders,
            body: {
                message: "Internal server error",
                status: "error",
                timestamp: new Date().toISOString()
            }
        };
    }
    
    context.done();
};