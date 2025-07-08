const { DatabaseService } = require('../shared/database');
const { validateJWT } = require('../shared/auth');

module.exports = async function (context, req) {
    context.log('Admin update user level function processed a request.');

    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'PUT, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Content-Type': 'application/json'
    };

    if (req.method === 'OPTIONS') {
        context.res = {
            status: 200,
            headers: corsHeaders
        };
        return;
    }

    let userIdFromToken = null;
    let userRoleFromToken = null;

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        try {
            const token = authHeader.substring(7);
            const decoded = validateJWT(token);
            userIdFromToken = decoded.userId;
            userRoleFromToken = decoded.role;
        } catch (authError) {
            context.res = {
                status: 401,
                headers: corsHeaders,
                body: { success: false, message: 'Unauthorized: Invalid token.' }
            };
            return;
        }
    } else {
        context.res = {
            status: 401,
            headers: corsHeaders,
            body: { success: false, message: 'Unauthorized: No token provided.' }
        };
        return;
    }

    if (userRoleFromToken !== 'admin') {
        context.res = {
            status: 403,
            headers: corsHeaders,
            body: { success: false, message: 'Forbidden: Admin access required.' }
        };
        return;
    }

    try {
        const { targetUserId, newCEFRLevel } = req.body;

        if (!targetUserId || !newCEFRLevel) {
            context.res = {
                status: 400,
                headers: corsHeaders,
                body: { success: false, message: 'targetUserId and newCEFRLevel are required.' }
            };
            return;
        }

        const validLevels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
        if (!validLevels.includes(newCEFRLevel)) {
            context.res = {
                status: 400,
                headers: corsHeaders,
                body: { success: false, message: 'Invalid CEFR level provided.' }
            };
            return;
        }

        const database = new DatabaseService();
        await database.initialize();

        const user = await database.getUserById(targetUserId);

        if (!user) {
            context.res = {
                status: 404,
                headers: corsHeaders,
                body: { success: false, message: 'User not found.' }
            };
            return;
        }

        // Update user's CEFR level and add to history
        user.cefrLevel = newCEFRLevel;
        if (!user.levelHistory) {
            user.levelHistory = [];
        }
        user.levelHistory.push({
            level: newCEFRLevel,
            timestamp: new Date().toISOString(),
            updatedBy: userIdFromToken // Admin who made the change
        });

        await database.updateUser(user);

        context.res = {
            status: 200,
            headers: corsHeaders,
            body: { success: true, message: `User ${targetUserId} CEFR level updated to ${newCEFRLevel}.` }
        };

    } catch (error) {
        context.log.error('Error updating user CEFR level:', error.message);
        context.res = {
            status: 500,
            headers: corsHeaders,
            body: { success: false, message: 'Internal server error.', details: error.message }
        };
    }
};