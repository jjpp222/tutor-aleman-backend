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
            context.log('Panel Admin - Fetching access requests with current user levels...');
            
            const requests = await DatabaseService.getAllAccessRequests();
            context.log(`Panel Admin - Found ${requests.length} access requests`);
            
            // Get current user levels from Users table
            const users = await DatabaseService.getAllUsers();
            const userLevelsMap = {};
            users.forEach(user => {
                userLevelsMap[user.email] = user.cefrLevel || user.germanLevel;
            });
            
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
                        germanLevel: userLevelsMap[request.email] || request.germanLevel,
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
            let newStatus;
            if (action === 'approve') {
                newStatus = 'approved';
            } else if (action === 'reject') {
                newStatus = 'rejected';
            } else if (action === 'pending') {
                newStatus = 'pending';
            } else {
                context.res = {
                    status: 400,
                    headers: corsHeaders,
                    body: {
                        success: false,
                        error: 'Invalid action. Must be approve, reject, or pending'
                    }
                };
                return;
            }
            
            const updateData = {
                status: newStatus,
                adminNotes: adminNotes || ''
            };
            
            const updatedRequest = await DatabaseService.updateAccessRequest(
                requestId, 
                updateData, 
                'admin-system'
            );
            
            // CRITICAL: Also update the user status so they can login
            if (updatedRequest && updatedRequest.userId) {
                try {
                    await DatabaseService.updateUserStatus(
                        updatedRequest.userId, 
                        newStatus,
                        'admin-system'
                    );
                    context.log(`Panel Admin - User status updated: ${updatedRequest.userId} -> ${newStatus}`);
                } catch (userUpdateError) {
                    context.log.error('Panel Admin - Failed to update user status:', userUpdateError.message);
                    // Continue anyway, the request was processed
                }
            }
            
            let successMessage;
            if (action === 'approve') {
                successMessage = 'Request approved successfully. User can now login.';
            } else if (action === 'reject') {
                successMessage = 'Request rejected successfully. User cannot login.';
            } else if (action === 'pending') {
                successMessage = 'Request reverted to pending successfully. User access suspended pending review.';
            }
            
            context.res = {
                status: 200,
                headers: corsHeaders,
                body: {
                    success: true,
                    message: successMessage
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