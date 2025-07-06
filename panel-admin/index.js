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
        } else if (req.method === 'POST') {
            context.log('Panel Admin - Processing request...');
            
            const { parseRequestBody } = require('../shared/utils');
            const requestBody = parseRequestBody(req);
            const { requestId, action, adminNotes } = requestBody;
            
            context.log(`Panel Admin - Action: ${action}, RequestId: ${requestId}`);
            
            if (!requestId || !action) {
                context.res = {
                    status: 400,
                    headers: corsHeaders,
                    body: {
                        success: false,
                        error: 'Missing requestId or action'
                    }
                };
                return;
            }
            
            // Update the request status using existing method
            const updateData = {
                status: action === 'approve' ? 'approved' : 'rejected',
                adminNotes: adminNotes || ''
            };
            
            const updatedRequest = await DatabaseService.updateAccessRequest(
                requestId, 
                updateData, 
                'admin-system'
            );
            
            context.res = {
                status: 200,
                headers: corsHeaders,
                body: {
                    success: true,
                    message: `Request ${action}d successfully`
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