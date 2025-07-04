const { requireAdmin } = require('../shared/auth');
const { DatabaseService } = require('../shared/database');
const { parseRequestBody } = require('../shared/utils');

module.exports = async function (context, req) {
    context.log('Admin manage requests - START');

    try {
        // ===== AUTHENTICATION =====
        const isAdmin = await requireAdmin(context, req);
        if (!isAdmin) {
            context.log('Admin manage requests - Authentication failed');
            return; // Response already set by middleware
        }
        const adminUser = req.user;
        context.log(`Admin manage requests - Admin request from: ${adminUser.email}`);

        // ===== HANDLE DIFFERENT METHODS =====
        
        if (req.method === 'GET') {
            // ===== GET ALL ACCESS REQUESTS =====
            const status = req.query.status; // Optional filter
            context.log(`Admin manage requests - Fetching access requests with status: ${status || 'all'}`);
            context.log(`Admin manage requests - Using container: ${DatabaseService.config.containers.accessRequests}`);
            
            let requests = [];
            try {
                context.log('Admin manage requests - Attempting to fetch access requests from DB...');
                requests = await DatabaseService.getAllAccessRequests(status);
                context.log(`Admin manage requests - Successfully found ${requests.length} access requests from DB.`);
                
                context.res = {
                    status: 200,
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
                            institution: request.institution,
                            status: request.status,
                            createdAt: request.createdAt,
                            reviewedBy: request.reviewedBy,
                            reviewedAt: request.reviewedAt,
                            adminNotes: request.adminNotes
                        })),
                        totalRequests: requests.length,
                        filters: {
                            status: status || 'all'
                        }
                    }
                };
            } catch (dbError) {
                context.log.error('Admin manage requests - Database error:', dbError.message);
                context.log.error('Admin manage requests - Error stack:', dbError.stack);
                
                context.res = {
                    status: 500,
                    body: {
                        success: false,
                        error: 'Failed to fetch access requests',
                        message: dbError.message,
                        timestamp: new Date().toISOString()
                    }
                };
            }
            
        } else if (req.method === 'POST') {
            // ===== APPROVE/REJECT REQUEST =====
            context.log('Admin manage requests - Handling POST request to approve/reject.');
            const { requestId, action, adminNotes } = parseRequestBody(req) || {};
            
            // Validate input
            if (!requestId || !action) {
                context.res = {
                    status: 400,
                    body: {
                        success: false,
                        error: 'Missing required fields',
                        message: 'requestId and action are required'
                    }
                };
                return;
            }
            
            if (!['approve', 'reject'].includes(action)) {
                context.res = {
                    status: 400,
                    body: {
                        success: false,
                        error: 'Invalid action',
                        message: 'Action must be either "approve" or "reject"'
                    }
                };
                return;
            }
            
            // Get the access request
            const request = await DatabaseService.getAccessRequestByUserId(requestId);
            if (!request) {
                context.res = {
                    status: 404,
                    body: {
                        success: false,
                        error: 'Request not found',
                        message: 'Access request not found'
                    }
                };
                return;
            }
            
            if (request.status !== 'pending') {
                context.res = {
                    status: 400,
                    body: {
                        success: false,
                        error: 'Request already processed',
                        message: `Request has already been ${request.status}`
                    }
                };
                return;
            }
            
            // Update request status
            const newStatus = action === 'approve' ? 'approved' : 'rejected';
            const updatedRequest = await DatabaseService.updateAccessRequest(
                request.id, 
                { 
                    status: newStatus,
                    adminNotes: adminNotes || null
                },
                adminUser.id
            );
            
            // Update user status
            const userStatus = action === 'approve' ? 'approved' : 'rejected';
            await DatabaseService.updateUserStatus(request.userId, userStatus, adminUser.id);
            
            context.log(`Admin manage requests - Access request ${action}d: ${request.id} by admin ${adminUser.id}`);
            
            context.res = {
                status: 200,
                body: {
                    success: true,
                    message: `Access request ${action}d successfully`,
                    request: {
                        id: updatedRequest.id,
                        userId: updatedRequest.userId,
                        email: updatedRequest.email,
                        name: updatedRequest.name,
                        surname: updatedRequest.surname,
                        status: updatedRequest.status,
                        reviewedBy: updatedRequest.reviewedBy,
                        reviewedAt: updatedRequest.reviewedAt,
                        adminNotes: updatedRequest.adminNotes
                    },
                    action: action,
                    reviewedBy: {
                        id: adminUser.id,
                        email: adminUser.email,
                        name: adminUser.name
                    }
                }
            };
        }

    } catch (error) {
        context.log.error('Admin manage requests - General error:', error.message);
        context.log.error('Admin manage requests - Error stack:', error.stack);

        context.res = {
            status: 500,
            body: {
                success: false,
                error: 'Admin operation failed',
                message: error.message,
                timestamp: new Date().toISOString()
            }
        };
    }
    context.log('Admin manage requests - END');
};