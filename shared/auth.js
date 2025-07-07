// ===== AUTHENTICATION & AUTHORIZATION MIDDLEWARE =====
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { DatabaseService } = require('./database');

// ===== CONFIGURATION =====
const config = {
    jwtSecret: process.env.JWT_SECRET,
    jwtExpiration: '24h',
    saltRounds: 12,
    roles: {
        STUDENT: 'student',
        ADMIN: 'admin'
    },
    statuses: {
        PENDING: 'pending',
        APPROVED: 'approved',
        REJECTED: 'rejected',
        SUSPENDED: 'suspended'
    }
};

// ===== PASSWORD UTILITIES =====
class PasswordService {
    static async hash(password) {
        return await bcrypt.hash(password, config.saltRounds);
    }
    
    static async verify(password, hashedPassword) {
        return await bcrypt.compare(password, hashedPassword);
    }
    
    static validate(password) {
        // Password requirements: at least 8 characters, 1 uppercase, 1 lowercase, 1 number
        const minLength = 8;
        const hasUpperCase = /[A-Z]/.test(password);
        const hasLowerCase = /[a-z]/.test(password);
        const hasNumbers = /\d/.test(password);
        
        const errors = [];
        
        if (password.length < minLength) {
            errors.push(`Password must be at least ${minLength} characters long`);
        }
        if (!hasUpperCase) {
            errors.push('Password must contain at least one uppercase letter');
        }
        if (!hasLowerCase) {
            errors.push('Password must contain at least one lowercase letter');
        }
        if (!hasNumbers) {
            errors.push('Password must contain at least one number');
        }
        
        return {
            isValid: errors.length === 0,
            errors
        };
    }
}

// ===== TOKEN UTILITIES =====
class TokenService {
    static generate(payload) {
        return jwt.sign(payload, config.jwtSecret, { 
            expiresIn: config.jwtExpiration 
        });
    }
    
    static verify(token) {
        try {
            return jwt.verify(token, config.jwtSecret);
        } catch (error) {
            throw new Error('Invalid or expired token');
        }
    }
    
    static decode(token) {
        return jwt.decode(token);
    }
}

// ===== AUTHENTICATION SERVICE =====
class AuthService {
    
    static async register(userData) {
        const { email, password, name, surname, germanLevel, motivation, institution } = userData;
        
        // Validate input
        if (!email || !password || !name || !surname || !germanLevel || !motivation) {
            throw new Error('Missing required fields: email, password, name, surname, germanLevel, motivation');
        }
        
        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            throw new Error('Invalid email format');
        }
        
        // Validate password
        const passwordValidation = PasswordService.validate(password);
        if (!passwordValidation.isValid) {
            throw new Error(`Password validation failed: ${passwordValidation.errors.join(', ')}`);
        }
        
        // Check if user already exists
        const existingUser = await DatabaseService.getUserByEmail(email);
        if (existingUser) {
            throw new Error('User with this email already exists');
        }
        
        // Hash password
        const hashedPassword = await PasswordService.hash(password);
        
        // Create user
        const user = await DatabaseService.createUser({
            email: email.toLowerCase(),
            hashedPassword,
            name,
            surname,
            role: config.roles.STUDENT,
            status: config.statuses.PENDING,
            germanLevel,
            cefrLevel: germanLevel, // Initialize CEFR level with self-reported level
            levelHistory: [{
                level: germanLevel,
                date: new Date().toISOString(),
                source: 'initial-registration',
                previousLevel: null
            }],
            motivation,
            institution: institution || null
        });
        
        // Create access request
        await DatabaseService.createAccessRequest({
            userId: user.id,
            email: user.email,
            name,
            surname,
            germanLevel,
            motivation,
            institution: institution || null
        });
        
        // Return user without password
        const { hashedPassword: _, ...userWithoutPassword } = user;
        return userWithoutPassword;
    }
    
    static async login(email, password) {
        if (!email || !password) {
            throw new Error('Email and password are required');
        }
        
        // Get user
        const user = await DatabaseService.getUserByEmail(email.toLowerCase());
        if (!user) {
            throw new Error('Invalid email or password');
        }
        
        // Debug logging
        console.log('User found:', { id: user.id, email: user.email, hasPasswordHash: !!user.passwordHash, hasHashedPassword: !!user.hashedPassword });
        
        // Verify password (support both hashedPassword and passwordHash for backward compatibility)
        const passwordHash = user.hashedPassword || user.passwordHash;
        if (!passwordHash) {
            throw new Error('User password data is missing or corrupted');
        }
        
        const isPasswordValid = await PasswordService.verify(password, passwordHash);
        if (!isPasswordValid) {
            throw new Error('Invalid email or password');
        }
        
        // Check user status (students need approval, admins can always login)
        if (user.role === config.roles.STUDENT && user.status !== config.statuses.APPROVED) {
            let message = 'Account access pending approval';
            if (user.status === config.statuses.REJECTED) {
                message = 'Account access has been rejected';
            } else if (user.status === config.statuses.SUSPENDED) {
                message = 'Account has been suspended';
            }
            throw new Error(message);
        }
        
        // Update last login
        await DatabaseService.updateUser(user.id, {
            lastLoginAt: new Date().toISOString()
        });
        
        // Generate token
        const tokenPayload = {
            userId: user.id,
            email: user.email,
            role: user.role,
            status: user.status,
            cefr: user.cefrLevel || 'B1'
        };
        
        const token = TokenService.generate(tokenPayload);
        
        // Return user without password + token
        const { hashedPassword: _, ...userWithoutPassword } = user;
        return {
            user: userWithoutPassword,
            token
        };
    }
    
    static async refreshToken(oldToken) {
        const decoded = TokenService.verify(oldToken);
        
        // Get fresh user data
        const user = await DatabaseService.getUserById(decoded.userId);
        if (!user) {
            throw new Error('User not found');
        }
        
        // Generate new token
        const tokenPayload = {
            userId: user.id,
            email: user.email,
            role: user.role,
            status: user.status,
            cefr: user.cefrLevel || 'B1'
        };
        
        return TokenService.generate(tokenPayload);
    }
}

// ===== AUTHORIZATION MIDDLEWARE =====
function requireAuth(allowedRoles = null, allowedStatuses = null) {
    return async (context, req) => {
        try {
            // Extract token from Authorization header
            const authHeader = req.headers.authorization;
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                throw new Error('No valid authorization token provided');
            }
            
            const token = authHeader.substring(7); // Remove 'Bearer ' prefix
            const decoded = TokenService.verify(token);
            
            // Get fresh user data
            const user = await DatabaseService.getUserById(decoded.userId);
            if (!user) {
                throw new Error('User not found');
            }
            
            // Check role authorization
            if (allowedRoles && !allowedRoles.includes(user.role)) {
                throw new Error('Insufficient permissions - role not authorized');
            }
            
            // Check status authorization
            if (allowedStatuses && !allowedStatuses.includes(user.status)) {
                throw new Error('Insufficient permissions - account status not authorized');
            }
            
            // Add user to request context
            req.user = user;
            req.tokenPayload = decoded;
            
            return true;
            
        } catch (error) {
            context.res = {
                status: 401,
                body: {
                    success: false,
                    error: 'Authentication failed',
                    message: error.message,
                    timestamp: new Date().toISOString()
                }
            };
            return false;
        }
    };
}

// ===== ROLE-BASED MIDDLEWARE SHORTCUTS =====
const requireStudent = requireAuth([config.roles.STUDENT], [config.statuses.APPROVED]);
const requireAdmin = requireAuth([config.roles.ADMIN]);
const requireAnyAuth = requireAuth();

module.exports = {
    AuthService,
    PasswordService,
    TokenService,
    requireAuth,
    requireStudent,
    requireAdmin,
    requireAnyAuth,
    config
};