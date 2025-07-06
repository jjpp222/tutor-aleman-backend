const { DatabaseService } = require('../shared/database');
const { PasswordService, config } = require('../shared/auth');

module.exports = async function (context, req) {
    context.log('Admin setup request');

    try {
        // This endpoint requires function-level auth (higher security)
        // Only accessible with function key

        if (req.method !== 'POST') {
            context.res = {
                status: 405,
                body: {
                    success: false,
                    error: 'Method not allowed'
                }
            };
            return;
        }

        // ===== INITIALIZE DATABASE =====
        context.log('Initializing database...');
        const dbInitResult = await DatabaseService.initializeDatabase();
        
        if (!dbInitResult) {
            throw new Error('Failed to initialize database');
        }

        // ===== CREATE ADMIN USER =====
        const { 
            adminEmail = 'admin@tutoraleman.com', 
            adminPassword,
            adminName = 'System',
            adminSurname = 'Administrator'
        } = req.body || {};

        if (!adminPassword) {
            context.res = {
                status: 400,
                body: {
                    success: false,
                    error: 'Admin password is required',
                    message: 'Please provide adminPassword in the request body'
                }
            };
            return;
        }

        // Check if admin already exists
        const existingAdmin = await DatabaseService.getUserByEmail(adminEmail);
        
        let adminUser;
        if (existingAdmin) {
            context.log('Admin user already exists');
            adminUser = existingAdmin;
        } else {
            context.log('Creating admin user...');
            
            // Validate admin password
            const passwordValidation = PasswordService.validate(adminPassword);
            if (!passwordValidation.isValid) {
                context.res = {
                    status: 400,
                    body: {
                        success: false,
                        error: 'Invalid admin password',
                        details: passwordValidation.errors
                    }
                };
                return;
            }

            // Hash password
            const hashedPassword = await PasswordService.hash(adminPassword);

            // Create admin user
            adminUser = await DatabaseService.createUser({
                email: adminEmail.toLowerCase(),
                hashedPassword,
                name: adminName,
                surname: adminSurname,
                role: config.roles.ADMIN,
                status: config.statuses.APPROVED, // Admins are auto-approved
                germanLevel: 'N/A', // Not applicable for admins
                motivation: 'System Administrator',
                institution: 'System'
            });

            context.log(`Admin user created: ${adminUser.id}`);
        }

        // ===== SETUP SUMMARY =====
        const stats = {
            totalUsers: (await DatabaseService.getAllUsers()).length,
            totalStudents: (await DatabaseService.getAllUsers('student')).length,
            totalAdmins: (await DatabaseService.getAllUsers('admin')).length,
            pendingRequests: (await DatabaseService.getAllAccessRequests('pending')).length
        };

        context.res = {
            status: 200,
            body: {
                success: true,
                message: 'System setup completed successfully',
                database: {
                    initialized: true,
                    containersCreated: ['Users', 'Sessions', 'AccessRequests']
                },
                admin: {
                    created: !existingAdmin,
                    email: adminUser.email,
                    id: adminUser.id,
                    role: adminUser.role,
                    status: adminUser.status
                },
                statistics: stats,
                nextSteps: [
                    'Admin user is ready to use',
                    'Students can now register and request access',
                    'Use /api/auth/login to authenticate',
                    'Use /api/admin/requests to manage student requests'
                ]
            }
        };

    } catch (error) {
        context.log.error('Setup error:', error.message);
        context.log.error('Error stack:', error.stack);

        context.res = {
            status: 500,
            body: {
                success: false,
                error: 'Setup failed',
                message: error.message,
                timestamp: new Date().toISOString()
            }
        };
    }
};