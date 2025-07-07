const { DatabaseService } = require('../shared/database');
const { config } = require('../shared/auth');

module.exports = async function (context, req) {
    context.log('CEFR Level Migration function triggered.');

    // Basic security: require a function key (authLevel: function in function.json)
    // For production, consider more robust authentication/authorization

    try {
        const usersContainer = DatabaseService.database.container(DatabaseService.config.containers.users);
        
        // Fetch all users
        const { resources: users } = await usersContainer.items.readAll().fetchAll();
        context.log(`Found ${users.length} users to check.`);

        let migratedCount = 0;
        for (const user of users) {
            if (!user.cefrLevel) {
                // User does not have cefrLevel, initialize it
                const initialLevel = user.germanLevel || 'B1'; // Fallback to B1 if germanLevel is also missing
                
                user.cefrLevel = initialLevel;
                user.levelHistory = [{
                    level: initialLevel,
                    date: new Date().toISOString(),
                    source: 'data-migration',
                    previousLevel: user.germanLevel // Store original germanLevel as previous
                }];
                user.updatedAt = new Date().toISOString();

                // Replace the user document in Cosmos DB
                const { resource: updatedUser } = await usersContainer.item(user.id, user.id).replace(user);
                context.log(`Migrated user ${updatedUser.id} to CEFR level ${updatedUser.cefrLevel}`);
                migratedCount++;
            }
        }

        context.res = {
            status: 200,
            body: {
                success: true,
                message: `Migration complete. ${migratedCount} users updated.`, 
                totalUsersChecked: users.length
            }
        };

    } catch (error) {
        context.log.error('CEFR Level Migration error:', error);
        context.res = {
            status: 500,
            body: {
                success: false,
                message: 'An error occurred during migration.',
                details: error.message
            }
        };
    }
};
