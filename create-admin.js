// Temporary script to create admin user
const { AuthService } = require('./shared/auth');
const { DatabaseService } = require('./shared/database');

async function createAdminUser() {
    try {
        console.log('Creating admin user...');
        
        // Create admin user directly in the database
        const adminUser = await DatabaseService.createUser({
            email: 'admin@tutoraleman.com',
            hashedPassword: await require('bcryptjs').hash('AdminPass123!', 12),
            name: 'Admin',
            surname: 'User',
            role: 'admin',
            status: 'approved',
            germanLevel: 'C2',
            motivation: 'System administrator',
            institution: 'TutorAleman'
        });
        
        console.log('Admin user created successfully:', adminUser);
        
        // Also create a test student user
        const testUser = await DatabaseService.createUser({
            email: 'thunder@example.com',
            hashedPassword: await require('bcryptjs').hash('TestPass123!', 12),
            name: 'Thunder',
            surname: 'Test',
            role: 'student',
            status: 'approved',
            germanLevel: 'B1',
            motivation: 'Test user for system validation',
            institution: 'Test University'
        });
        
        console.log('Test student user created successfully:', testUser);
        
    } catch (error) {
        console.error('Error creating admin user:', error);
    }
}

// Run the script
createAdminUser();