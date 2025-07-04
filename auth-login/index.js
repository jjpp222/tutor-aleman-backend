const { AuthService } = require('../shared/auth');

module.exports = async function (context, req) {
    context.log('User login request');

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

        // Extract login data
        context.log('Full request body:', req.body);
        context.log('Request raw body:', req.rawBody);
        const { email, password } = req.body || {};

        context.log(`Login attempt for email: ${email}`);

        // ===== VALIDATION =====
        if (!email || !password) {
            context.res = {
                status: 400,
                body: {
                    success: false,
                    error: 'Missing credentials',
                    message: 'Email and password are required'
                }
            };
            return;
        }

        // ===== AUTHENTICATE USER =====
        const result = await AuthService.login(email, password);

        context.log(`User authenticated successfully: ${result.user.id} (${result.user.role})`);

        // ===== SUCCESS RESPONSE =====
        context.res = {
            status: 200,
            body: {
                success: true,
                message: 'Login successful',
                user: {
                    id: result.user.id,
                    email: result.user.email,
                    name: result.user.name,
                    surname: result.user.surname,
                    role: result.user.role,
                    status: result.user.status,
                    germanLevel: result.user.germanLevel,
                    lastLoginAt: result.user.lastLoginAt
                },
                token: result.token,
                expiresIn: '24h'
            }
        };

    } catch (error) {
        context.log.error('Login error:', error.message);

        // Determine appropriate status code
        let statusCode = 500;
        if (error.message.includes('Invalid email or password')) {
            statusCode = 401; // Unauthorized
        } else if (error.message.includes('pending') || error.message.includes('rejected') || error.message.includes('suspended')) {
            statusCode = 403; // Forbidden
        } else if (error.message.includes('required')) {
            statusCode = 400; // Bad Request
        }

        context.res = {
            status: statusCode,
            body: {
                success: false,
                error: 'Authentication failed',
                message: error.message,
                timestamp: new Date().toISOString()
            }
        };
    }
};