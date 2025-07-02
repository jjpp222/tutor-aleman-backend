module.exports = async function (context, req) {
    context.log('Voice conversation test endpoint called');

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

        // Mock response for testing
        const mockGermanResponse = "Hallo! Mir geht es gut, danke. Wie geht es Ihnen denn? Das ist ein Test.";

        context.res = {
            status: 200,
            headers: corsHeaders,
            body: {
                success: true,
                germanResponse: mockGermanResponse,
                transcript: transcript,
                voiceUsed: 'Mock Voice (Test Mode)',
                sessionId: `voice_test_${Date.now()}`,
                timestamp: new Date().toISOString(),
                pipeline: 'Test mode - no AI/TTS integration yet'
            }
        };

        context.log('Voice conversation test completed successfully');

    } catch (error) {
        context.log.error('Voice conversation test error:', error.message);
        
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