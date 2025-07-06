const { DatabaseService } = require('../shared/database');

module.exports = async function (context, req) {
    context.log('Panel Admin - NEW FUNCTION START');

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
            context.log('Panel Admin - Fetching access requests...');
            
            const requests = await DatabaseService.getAllAccessRequests();
            context.log(`Panel Admin - Found ${requests.length} access requests`);
            
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
                    endpoint: 'panel-admin'
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
        context.log.error('Panel Admin - Error:', error.message);
        
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
    
    context.log('Panel Admin - NEW FUNCTION END');
};