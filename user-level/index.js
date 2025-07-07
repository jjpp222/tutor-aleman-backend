const { DatabaseService } = require('../shared/database');
const { validateJWT } = require('../shared/auth');

module.exports = async function (context, req) {
    context.log('User level management function triggered');

    // CORS headers
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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
        // Validate JWT token
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            context.res = {
                status: 401,
                headers: corsHeaders,
                body: {
                    success: false,
                    error: 'Missing or invalid authorization header'
                }
            };
            return;
        }

        const token = authHeader.substring(7);
        const decoded = validateJWT(token);
        
        if (!decoded) {
            context.res = {
                status: 401,
                headers: corsHeaders,
                body: {
                    success: false,
                    error: 'Invalid token'
                }
            };
            return;
        }

        const userId = decoded.userId;

        if (req.method === 'GET') {
            // Get current CEFR level for user
            let user;
            try {
                user = await DatabaseService.getUserById(userId);
                if (!user) {
                    context.log.warn(`User with ID ${userId} not found in database.`);
                    context.res = {
                        status: 404,
                        headers: corsHeaders,
                        body: {
                            success: false,
                            error: 'User not found'
                        }
                    };
                    return;
                }
            } catch (dbError) {
                context.log.error(`Error fetching user ${userId} from database:`, dbError);
                context.res = {
                    status: 500,
                    headers: corsHeaders,
                    body: {
                        success: false,
                        error: 'Database error fetching user',
                        details: dbError.message
                    }
                };
                return;
            }

            const currentLevel = await DatabaseService.getUserCEFRLevel(userId);
            
            context.res = {
                status: 200,
                headers: corsHeaders,
                body: {
                    success: true,
                    cefrLevel: currentLevel,
                    germanLevel: user?.germanLevel || null,
                    levelHistory: user?.levelHistory || [],
                    hasLevel: !!(user?.cefrLevel || user?.germanLevel)
                }
            };
            return;
        }

        if (req.method === 'POST') {
            const { level, source = 'manual-override' } = req.body || {};
            
            if (!level || !['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].includes(level)) {
                context.res = {
                    status: 400,
                    headers: corsHeaders,
                    body: {
                        success: false,
                        error: 'Invalid CEFR level. Must be A1, A2, B1, B2, C1, or C2'
                    }
                };
                return;
            }

            // Update user CEFR level
            const updatedUser = await DatabaseService.updateUserCEFRLevel(userId, level, source);
            
            context.log(`Updated CEFR level for user ${userId}: ${level} (source: ${source})`);
            
            context.res = {
                status: 200,
                headers: corsHeaders,
                body: {
                    success: true,
                    cefrLevel: updatedUser.cefrLevel,
                    levelHistory: updatedUser.levelHistory,
                    message: `CEFR level updated to ${level}`
                }
            };
            return;
        }

        // Method not allowed
        context.res = {
            status: 405,
            headers: corsHeaders,
            body: {
                success: false,
                error: 'Method not allowed'
            }
        };

    } catch (error) {
        context.log.error('User level management error:', error);
        
        context.res = {
            status: 500,
            headers: corsHeaders,
            body: {
                success: false,
                error: 'Internal server error',
                details: error.message
            }
        };
    }
};