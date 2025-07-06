const { DatabaseService } = require('../shared/database');

module.exports = async function (context, req) {
    context.log('Admin requests v2 - WORKAROUND FUNCTION');

    try {
        // CORS headers
        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        };

        if (req.method === 'OPTIONS') {
            context.res = {
                status: 200,
                headers: corsHeaders
            };
            return;
        }

        if (req.method === 'GET') {
            context.log('Admin requests v2 - Fetching access requests...');
            
            const requests = await DatabaseService.getAllAccessRequests();
            context.log(`Admin requests v2 - Found ${requests.length} access requests`);
            
            context.res = {
                status: 200,
                headers: corsHeaders,
                body: {
                    success: true,
                    requests: requests.map(request => ({
                        id: request.id,
                        userId: request.userId,
                        email: request.email,
                        name: request.name,
                        surname: request.surname,
                        germanLevel: request.germanLevel,
                        motivation: request.motivation,
                        status: request.status,
                        createdAt: request.createdAt
                    })),
                    totalRequests: requests.length,
                    workaround: true
                }
            };
        } else {
            context.res = {
                status: 405,
                headers: corsHeaders,
                body: {
                    success: false,
                    error: 'Method not allowed'
                }
            };
        }

    } catch (error) {
        context.log.error('Admin requests v2 - Error:', error.message);
        
        context.res = {
            status: 500,
            headers: {
                'Access-Control-Allow-Origin': '*'
            },
            body: {
                success: false,
                error: 'Failed to fetch requests',
                message: error.message
            }
        };
    }
};