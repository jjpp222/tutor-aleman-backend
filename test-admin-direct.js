const { DatabaseService } = require('./shared/database');
const { AuthService } = require('./shared/auth');

async function testAdminFlow() {
    console.log('=== TESTING ADMIN FLOW ===');
    
    try {
        // 1. Database is initialized on import
        console.log('Database client initialized');
        
        // 2. Create admin user if not exists
        console.log('Creating admin user...');
        const adminData = {
            email: 'admin@tutoraleman.com',
            password: 'AdminPass123!',
            name: 'Admin',
            surname: 'User',
            germanLevel: 'Native',
            motivation: 'Admin access',
            institution: 'TutorAleman'
        };
        
        try {
            await AuthService.register(adminData);
            console.log('Admin user created successfully');
        } catch (error) {
            if (error.message.includes('already exists')) {
                console.log('Admin user already exists');
            } else {
                console.error('Error creating admin user:', error.message);
            }
        }
        
        // 3. Update user role to admin
        console.log('Updating user role to admin...');
        const user = await DatabaseService.getUserByEmail('admin@tutoraleman.com');
        if (user) {
            await DatabaseService.updateUser(user.id, {
                role: 'admin',
                status: 'approved'
            });
            console.log('User role updated to admin');
        }
        
        // 4. Test login
        console.log('Testing admin login...');
        const loginResult = await AuthService.login('admin@tutoraleman.com', 'AdminPass123!');
        console.log('Login successful:', {
            userId: loginResult.user.id,
            email: loginResult.user.email,
            role: loginResult.user.role,
            status: loginResult.user.status,
            token: loginResult.token.substring(0, 20) + '...'
        });
        
        // 5. Test access requests fetch
        console.log('Testing access requests fetch...');
        const requests = await DatabaseService.getAllAccessRequests();
        console.log(`Found ${requests.length} access requests`);
        
        console.log('=== ALL TESTS COMPLETED SUCCESSFULLY ===');
        
        // Output admin token for frontend testing
        console.log('\n=== ADMIN TOKEN FOR FRONTEND TESTING ===');
        console.log('Email: admin@tutoraleman.com');
        console.log('Password: AdminPass123!');
        console.log('Token:', loginResult.token);
        console.log('=======================================\n');
        
    } catch (error) {
        console.error('Test failed:', error.message);
        console.error('Stack:', error.stack);
    }
}

// Run the test
testAdminFlow().catch(console.error);