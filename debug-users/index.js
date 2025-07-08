const { DatabaseService } = require('../shared/database');

module.exports = async function (context, req) {
    context.log('DEBUG: Checking user CEFR levels in database');

    try {
        // CORS headers
        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        };

        if (req.method === 'OPTIONS') {
            context.res = {
                status: 200,
                headers: corsHeaders
            };
            return;
        }

        if (req.method !== 'GET') {
            context.res = {
                status: 405,
                headers: corsHeaders,
                body: { error: 'Method not allowed' }
            };
            return;
        }

        // Get all users
        const users = await DatabaseService.getAllUsers();
        context.log(`Found ${users.length} users`);

        // Analyze CEFR level fields
        const analysis = users.map(user => {
            return {
                id: user.id,
                email: user.email,
                name: `${user.name} ${user.surname}`,
                germanLevel: user.germanLevel,
                cefrLevel: user.cefrLevel,
                hasGermanLevel: !!user.germanLevel,
                hasCefrLevel: !!user.cefrLevel,
                levelHistory: user.levelHistory || [],
                createdAt: user.createdAt,
                status: user.status
            };
        });

        // Summary stats
        const stats = {
            totalUsers: users.length,
            usersWithGermanLevel: analysis.filter(u => u.hasGermanLevel).length,
            usersWithCefrLevel: analysis.filter(u => u.hasCefrLevel).length,
            usersWithBothLevels: analysis.filter(u => u.hasGermanLevel && u.hasCefrLevel).length,
            usersWithNeitherLevel: analysis.filter(u => !u.hasGermanLevel && !u.hasCefrLevel).length
        };

        context.res = {
            status: 200,
            headers: corsHeaders,
            body: {
                success: true,
                stats,
                users: analysis,
                message: 'User CEFR level analysis completed'
            }
        };

    } catch (error) {
        context.log.error('DEBUG: Error analyzing users:', error);
        
        context.res = {
            status: 500,
            body: {
                success: false,
                error: 'Internal server error',
                message: error.message
            }
        };
    }
};