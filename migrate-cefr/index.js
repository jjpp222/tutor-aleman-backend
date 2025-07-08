const { DatabaseService } = require('../shared/database');

module.exports = async function (context, req) {
    context.log('MIGRATION: Migrating user germanLevel to cefrLevel');

    try {
        // CORS headers
        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        };

        if (req.method === 'OPTIONS') {
            context.res = {
                status: 200,
                headers: corsHeaders
            };
            return;
        }

        if (req.method !== 'POST') {
            context.res = {
                status: 405,
                headers: corsHeaders,
                body: { error: 'Method not allowed. Use POST to confirm migration.' }
            };
            return;
        }

        // Safety check - require confirmation
        const { confirm } = req.body || {};
        if (confirm !== 'migrate-cefr-levels') {
            context.res = {
                status: 400,
                headers: corsHeaders,
                body: { 
                    error: 'Missing confirmation',
                    message: 'Send { "confirm": "migrate-cefr-levels" } to proceed'
                }
            };
            return;
        }

        // Get all users
        const users = await DatabaseService.getAllUsers();
        context.log(`Found ${users.length} users`);

        let migratedCount = 0;
        let skippedCount = 0;
        const results = [];

        for (const user of users) {
            if (!user.cefrLevel && user.germanLevel) {
                // User has germanLevel but no cefrLevel - migrate
                try {
                    await DatabaseService.updateUserCEFRLevel(
                        user.id, 
                        user.germanLevel, 
                        'migration-from-germanLevel'
                    );
                    
                    migratedCount++;
                    results.push({
                        userId: user.id,
                        email: user.email,
                        action: 'migrated',
                        germanLevel: user.germanLevel,
                        newCefrLevel: user.germanLevel
                    });
                    
                    context.log(`Migrated user ${user.email}: ${user.germanLevel} -> cefrLevel`);
                } catch (error) {
                    context.log.error(`Failed to migrate user ${user.email}:`, error);
                    results.push({
                        userId: user.id,
                        email: user.email,
                        action: 'error',
                        error: error.message
                    });
                }
            } else {
                // User already has cefrLevel or no germanLevel - skip
                skippedCount++;
                results.push({
                    userId: user.id,
                    email: user.email,
                    action: 'skipped',
                    germanLevel: user.germanLevel,
                    cefrLevel: user.cefrLevel,
                    reason: user.cefrLevel ? 'already has cefrLevel' : 'no germanLevel'
                });
            }
        }

        context.res = {
            status: 200,
            headers: corsHeaders,
            body: {
                success: true,
                stats: {
                    totalUsers: users.length,
                    migrated: migratedCount,
                    skipped: skippedCount
                },
                results,
                message: `Migration completed: ${migratedCount} users migrated, ${skippedCount} skipped`
            }
        };

    } catch (error) {
        context.log.error('MIGRATION: Error:', error);
        
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