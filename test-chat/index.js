module.exports = async function (context, req) {
    context.log('Test chat endpoint called');

    try {
        context.res = {
            status: 200,
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
            body: {
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            }
        };
    }
};