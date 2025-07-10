module.exports = async function (context, req) {
    context.log('Speech token request');

    // CORS headers
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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
        const speechKey = process.env.AZURE_SPEECH_KEY;
        const speechRegion = process.env.AZURE_SPEECH_REGION || 'swedencentral';

        if (!speechKey) {
            throw new Error('Speech Services key not configured');
        }

        // Get authorization token for Azure Speech Services
        const tokenEndpoint = `https://${speechRegion}.api.cognitive.microsoft.com/sts/v1.0/issuetoken`;
        
        const tokenResponse = await fetch(tokenEndpoint, {
            method: 'POST',
            headers: {
                'Ocp-Apim-Subscription-Key': speechKey,
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        if (!tokenResponse.ok) {
            throw new Error(`Token request failed: ${tokenResponse.status} ${tokenResponse.statusText}`);
        }

        const token = await tokenResponse.text();

        context.log('Speech token generated successfully');

        context.res = {
            status: 200,
            headers: corsHeaders,
            body: {
                success: true,
                token: token,
                region: speechRegion,
                timestamp: new Date().toISOString()
            }
        };

    } catch (error) {
        context.log.error('Speech token error:', error.message);
        
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