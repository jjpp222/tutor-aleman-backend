const { AuthService } = require('../shared/auth');
const { DatabaseService } = require('../shared/database');

module.exports = async function (context, req) {
    context.log('Student registration request');

    try {
        // Validate HTTP method
        if (req.method !== 'POST') {
            context.res = {
                status: 405,
                body: {
                    success: false,
                    error: 'Method not allowed',
                    message: 'Only POST method is allowed'
                }
            };
            return;
        }

        // Extract registration data
        const {
            email,
            password,
            name,
            surname,
            germanLevel,
            motivation,
            institution
        } = req.body || {};

        context.log(`Registration attempt for email: ${email}`);

        // ===== VALIDATION =====
        const requiredFields = { email, password, name, surname, germanLevel, motivation };
        const missingFields = Object.entries(requiredFields)
            .filter(([key, value]) => !value)
            .map(([key]) => key);

        if (missingFields.length > 0) {
            context.res = {
                status: 400,
                body: {
                    success: false,
                    error: 'Missing required fields',
                    missingFields,
                    requiredFields: ['email', 'password', 'name', 'surname', 'germanLevel', 'motivation']
                }
            };
            return;
        }

        // Validate German level
        const validLevels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
        if (!validLevels.includes(germanLevel)) {
            context.res = {
                status: 400,
                body: {
                    success: false,
                    error: 'Invalid German level',
                    validLevels
                }
            };
            return;
        }

        // ===== REGISTER USER =====
        const user = await AuthService.register({
            email,
            password,
            name,
            surname,
            germanLevel,
            motivation,
            institution
        });

        context.log(`User registered successfully: ${user.id}`);

        // ===== SUCCESS RESPONSE =====
        context.res = {
            status: 201,
            body: {
                success: true,
                message: 'Registration successful! Your access request has been submitted for admin approval.',
                user: {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    surname: user.surname,
                    status: user.status,
                    germanLevel: user.germanLevel,
                    createdAt: user.createdAt
                },
                nextSteps: [
                    'Your account is currently pending approval',
                    'An administrator will review your request',
                    'You will be notified when your account is approved',
                    'Once approved, you can login and start using the German tutor'
                ]
            }
        };

    } catch (error) {
        context.log.error('Registration error:', error.message);
        context.log.error('Error stack:', error.stack);

        // Determine appropriate status code
        let statusCode = 500;
        if (error.message.includes('already exists')) {
            statusCode = 409; // Conflict
        } else if (error.message.includes('validation') || error.message.includes('Invalid')) {
            statusCode = 400; // Bad Request
        }

        context.res = {
            status: statusCode,
            body: {
                success: false,
                error: 'Registration failed',
                message: error.message,
                timestamp: new Date().toISOString()
            }
        };
    }
};