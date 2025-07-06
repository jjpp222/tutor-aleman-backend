const { DatabaseService } = require('../shared/database');
const { parseRequestBody } = require('../shared/utils');

module.exports = async function (context, req) {
    context.log('Admin Panel Complete - Function started');
    
    try {
        // CORS headers for all responses
        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        };

        // Handle preflight OPTIONS request
        if (req.method === 'OPTIONS') {
            context.log('Admin Panel Complete - Handling CORS preflight');
            context.res = {
                status: 200,
                headers: corsHeaders
            };
            return;
        }

        // GET: Fetch all access requests for admin panel
        if (req.method === 'GET') {
            context.log('Admin Panel Complete - Fetching access requests...');
            
            try {
                const requests = await DatabaseService.getAllAccessRequests();
                context.log(`Admin Panel Complete - Found ${requests.length} access requests`);
                
                // Return formatted response
                context.res = {
                    status: 200,
                    headers: corsHeaders,
                    body: {
                        success: true,
                        requests: requests.map(request => ({
                            id: request.id,
                            userId: request.userId || request.id,
                            email: request.email,
                            name: request.name,
                            surname: request.surname,
                            germanLevel: request.germanLevel,
                            motivation: request.motivation,
                            status: request.status,
                            createdAt: request.createdAt,
                            reviewedBy: request.reviewedBy || null,
                            reviewedAt: request.reviewedAt || null,
                            adminNotes: request.adminNotes || ''
                        })),
                        totalRequests: requests.length,
                        endpoint: 'admin-panel-complete',
                        timestamp: new Date().toISOString()
                    }
                };
                
            } catch (error) {
                context.log.error('Admin Panel Complete - Database error:', error);
                context.res = {
                    status: 500,
                    headers: corsHeaders,
                    body: {
                        success: false,
                        error: 'Database connection failed',
                        message: error.message,
                        endpoint: 'admin-panel-complete'
                    }
                };
            }
            return;
        }

        // POST: Process admin actions (approve/reject requests)
        if (req.method === 'POST') {
            context.log('Admin Panel Complete - Processing admin action...');
            
            try {
                // Parse request body
                const requestBody = parseRequestBody(req);
                context.log('Admin Panel Complete - Request body:', JSON.stringify(requestBody));
                
                const { requestId, action, adminNotes } = requestBody;
                
                // Validate required fields
                if (!requestId) {
                    context.res = {
                        status: 400,
                        headers: corsHeaders,
                        body: {
                            success: false,
                            error: 'Missing requestId',
                            endpoint: 'admin-panel-complete'
                        }
                    };
                    return;
                }
                
                if (!action || !['approve', 'reject'].includes(action)) {
                    context.res = {
                        status: 400,
                        headers: corsHeaders,
                        body: {
                            success: false,
                            error: 'Invalid action. Must be "approve" or "reject"',
                            endpoint: 'admin-panel-complete'
                        }
                    };
                    return;
                }
                
                context.log(`Admin Panel Complete - Processing ${action} for request ${requestId}`);
                
                // Update the access request status
                const updateData = {
                    status: action === 'approve' ? 'approved' : 'rejected',
                    adminNotes: adminNotes || ''
                };
                
                const updatedRequest = await DatabaseService.updateAccessRequest(
                    requestId, 
                    updateData, 
                    'admin-system' // adminId - could be extracted from JWT token in the future
                );
                
                context.log('Admin Panel Complete - Request updated successfully');
                
                context.res = {
                    status: 200,
                    headers: corsHeaders,
                    body: {
                        success: true,
                        message: `Request ${action}d successfully`,
                        updatedRequest: {
                            id: updatedRequest.id,
                            status: updatedRequest.status,
                            reviewedAt: updatedRequest.reviewedAt,
                            adminNotes: updatedRequest.adminNotes
                        },
                        endpoint: 'admin-panel-complete'
                    }
                };
                
            } catch (error) {
                context.log.error('Admin Panel Complete - Processing error:', error);
                context.res = {
                    status: 500,
                    headers: corsHeaders,
                    body: {
                        success: false,
                        error: 'Failed to process request',
                        message: error.message,
                        endpoint: 'admin-panel-complete'
                    }
                };
            }
            return;
        }

        // Method not allowed
        context.res = {
            status: 405,
            headers: corsHeaders,
            body: {
                success: false,
                error: `Method ${req.method} not allowed`,
                allowedMethods: ['GET', 'POST', 'OPTIONS'],
                endpoint: 'admin-panel-complete'
            }
        };

    } catch (error) {
        context.log.error('Admin Panel Complete - Unexpected error:', error);
        context.res = {
            status: 500,
            headers: {
                'Access-Control-Allow-Origin': '*'
            },
            body: {
                success: false,
                error: 'Internal server error',
                message: error.message,
                endpoint: 'admin-panel-complete'
            }
        };
    }
    
    context.log('Admin Panel Complete - Function completed');
};