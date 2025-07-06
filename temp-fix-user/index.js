const { DatabaseService } = require('../shared/database');

module.exports = async function (context, req) {
    context.log('Temp Fix User - START');

    try {
        // Fix test@test.com user status
        const userId = "056208fc-f506-4b9d-955a-6b08d33f0d2a";
        
        context.log(`Fixing user status for userId: ${userId}`);
        
        const updatedUser = await DatabaseService.updateUserStatus(
            userId, 
            'approved',
            'admin-system'
        );
        
        context.log('User status updated successfully:', updatedUser);
        
        context.res = {
            status: 200,
            headers: {
                'Access-Control-Allow-Origin': '*'
            },
            body: {
                success: true,
                message: 'test@test.com user status fixed to approved',
                userId: userId,
                updatedUser: updatedUser
            }
        };

    } catch (error) {
        context.log.error('Temp Fix User - Error:', error);
        context.res = {
            status: 500,
            headers: {
                'Access-Control-Allow-Origin': '*'
            },
            body: {
                success: false,
                error: error.message
            }
        };
    }
    
    context.log('Temp Fix User - END');
};