module.exports = function (context, req) {
    context.log('Hello endpoint called');
    
    try {
        context.res = {
            status: 200,
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
            body: {
                message: "Internal server error",
                status: "error",
                timestamp: new Date().toISOString()
            }
        };
    }
    
    context.done();
};