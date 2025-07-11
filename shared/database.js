// ===== DATABASE MODELS & OPERATIONS =====
const { CosmosClient } = require('@azure/cosmos');
const { v4 } = require('uuid');

// ===== CONFIGURATION =====
const config = {
    endpoint: process.env.COSMOS_DB_ENDPOINT,
    key: process.env.COSMOS_DB_KEY,
    databaseId: process.env.COSMOS_DB_DATABASE_ID || 'TutorAlemanDB',
    containers: {
        users: 'Users',
        sessions: 'Sessions',
        accessRequests: 'AccessRequests'
    }
};

// ===== CLIENT INITIALIZATION =====
const client = new CosmosClient({ 
    endpoint: config.endpoint, 
    key: config.key 
});

const database = client.database(config.databaseId);

// ===== USER SCHEMA =====
const UserSchema = {
    id: 'string', // Auto-generated UUID
    email: 'string', // Unique identifier
    hashedPassword: 'string',
    name: 'string',
    surname: 'string',
    role: 'student|admin', // Role-based access
    status: 'pending|approved|rejected|suspended',
    
    // Student-specific fields
    germanLevel: 'A1|A2|B1|B2|C1|C2', // Initial self-reported level
    cefrLevel: 'A1|A2|B1|B2|C1|C2|null', // AI-detected/confirmed level (NEW)
    levelHistory: '[{level, date, source}]', // Level progression tracking (NEW)
    motivation: 'string', // Why they want to use the app
    institution: 'string', // School/University (optional)
    
    // Metadata
    createdAt: 'ISO8601',
    updatedAt: 'ISO8601',
    lastLoginAt: 'ISO8601',
    approvedBy: 'string', // Admin user ID who approved
    approvedAt: 'ISO8601'
};

// ===== ACCESS REQUEST SCHEMA =====
const AccessRequestSchema = {
    id: 'string',
    userId: 'string', // Reference to user
    email: 'string', // Duplicate for easy querying
    name: 'string',
    surname: 'string',
    germanLevel: 'string',
    motivation: 'string',
    institution: 'string',
    status: 'pending|approved|rejected',
    
    // Admin actions
    reviewedBy: 'string', // Admin user ID
    reviewedAt: 'ISO8601',
    adminNotes: 'string', // Internal notes
    
    // Metadata
    createdAt: 'ISO8601',
    updatedAt: 'ISO8601'
};

// ===== DATABASE OPERATIONS =====

class DatabaseService {
    
    // ===== USER OPERATIONS =====
    
    static async createUser(userData) {
        const container = database.container(config.containers.users);
        const user = {
            id: v4(),
            ...userData,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        const { resource } = await container.items.create(user);
        return resource;
    }
    
    static async getUserByEmail(email) {
        const container = database.container(config.containers.users);
        const query = {
            query: 'SELECT * FROM c WHERE c.email = @email',
            parameters: [{ name: '@email', value: email }]
        };
        
        const { resources } = await container.items.query(query).fetchAll();
        return resources[0] || null;
    }
    
    static async getUserById(userId) {
        const container = database.container(config.containers.users);
        const { resource } = await container.item(userId, userId).read();
        return resource;
    }
    
    static async updateUser(userId, updateData) {
        const container = database.container(config.containers.users);
        const { resource: user } = await container.item(userId, userId).read();
        
        // Update properties directly on the retrieved resource
        for (const key in updateData) {
            user[key] = updateData[key];
        }
        user.updatedAt = new Date().toISOString();
        
        const { resource } = await container.item(userId, userId).replace(user);
        return resource;
    }
    
    static async updateUserStatus(userId, status, adminId = null) {
        const updateData = { 
            status,
            updatedAt: new Date().toISOString()
        };
        
        if (status === 'approved' && adminId) {
            updateData.approvedBy = adminId;
            updateData.approvedAt = new Date().toISOString();
        }
        
        return await this.updateUser(userId, updateData);
    }
    
    // ===== CEFR LEVEL OPERATIONS (NEW) =====
    
    static async updateUserCEFRLevel(userId, newLevel, source = 'ai-detected') {
        const container = database.container(config.containers.users);
        const { resource: user } = await container.item(userId, userId).read();
        
        // Initialize levelHistory if it doesn't exist
        if (!user.levelHistory) {
            user.levelHistory = [];
        }
        
        // Add entry to history if level is actually changing
        if (user.cefrLevel !== newLevel) {
            user.levelHistory.push({
                level: newLevel,
                date: new Date().toISOString(),
                source: source, // 'ai-detected', 'placement-test', 'manual-override'
                previousLevel: user.cefrLevel || user.germanLevel
            });
            
            // Keep only last 10 entries to avoid bloating
            if (user.levelHistory.length > 10) {
                user.levelHistory = user.levelHistory.slice(-10);
            }
        }
        
        // Update current level
        user.cefrLevel = newLevel;
        user.updatedAt = new Date().toISOString();
        
        const { resource } = await container.item(userId, userId).replace(user);
        return resource;
    }
    
    static async getUserCEFRLevel(userId) {
        const user = await this.getUserById(userId);
        return user ? (user.cefrLevel || user.germanLevel || 'B1') : 'B1';
    }
    
    static async updateUserCEFRLevelByEmail(email, newLevel, source = 'admin_update') {
        const container = database.container(config.containers.users);
        const user = await this.getUserByEmail(email);
        
        if (!user) {
            throw new Error('Usuario no encontrado');
        }
        
        // Initialize levelHistory if it doesn't exist
        if (!user.levelHistory) {
            user.levelHistory = [];
        }
        
        // Add entry to history if level is actually changing
        if (user.cefrLevel !== newLevel) {
            user.levelHistory.push({
                level: newLevel,
                date: new Date().toISOString(),
                source: source,
                previousLevel: user.cefrLevel || user.germanLevel
            });
            
            // Keep only last 10 entries to avoid bloating
            if (user.levelHistory.length > 10) {
                user.levelHistory = user.levelHistory.slice(-10);
            }
        }
        
        // Update current level
        user.cefrLevel = newLevel;
        user.updatedAt = new Date().toISOString();
        
        const { resource } = await container.item(user.id, user.id).replace(user);
        return resource;
    }
    
    static async initializeUserCEFRLevel(userId, placementLevel) {
        const container = database.container(config.containers.users);
        const { resource: user } = await container.item(userId, userId).read();
        
        // Only set if not already set
        if (!user.cefrLevel) {
            user.cefrLevel = placementLevel;
            user.levelHistory = [{
                level: placementLevel,
                date: new Date().toISOString(),
                source: 'placement-test',
                previousLevel: user.germanLevel
            }];
            user.updatedAt = new Date().toISOString();
            
            const { resource } = await container.item(userId, userId).replace(user);
            return resource;
        }
        
        return user;
    }
    
    static async getAllUsers(role = null, status = null) {
        const container = database.container(config.containers.users);
        let querySpec = 'SELECT * FROM c';
        const parameters = [];
        
        const conditions = [];
        if (role) {
            conditions.push('c.role = @role');
            parameters.push({ name: '@role', value: role });
        }
        if (status) {
            conditions.push('c.status = @status');
            parameters.push({ name: '@status', value: status });
        }
        
        if (conditions.length > 0) {
            querySpec += ' WHERE ' + conditions.join(' AND ');
        }
        
        querySpec += ' ORDER BY c.createdAt DESC';
        
        const query = { query: querySpec, parameters };
        const { resources } = await container.items.query(query).fetchAll();
        return resources;
    }
    
    // ===== ACCESS REQUEST OPERATIONS =====
    
    static async createAccessRequest(requestData) {
        const container = database.container(config.containers.accessRequests);
        const request = {
            id: v4(),
            ...requestData,
            status: 'pending',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        const { resource } = await container.items.create(request);
        return resource;
    }
    
    static async getAccessRequestByUserId(userId) {
        const container = database.container(config.containers.accessRequests);
        const query = {
            query: 'SELECT * FROM c WHERE c.userId = @userId',
            parameters: [{ name: '@userId', value: userId }]
        };
        
        const { resources } = await container.items.query(query).fetchAll();
        return resources[0] || null;
    }
    
    static async getAllAccessRequests(status = null) {
        const container = database.container(config.containers.accessRequests);
        let querySpec = 'SELECT * FROM c';
        const parameters = [];
        
        if (status) {
            querySpec += ' WHERE c.status = @status';
            parameters.push({ name: '@status', value: status });
        }
        
        querySpec += ' ORDER BY c.createdAt DESC';
        
        const query = { query: querySpec, parameters };
        console.log('DatabaseService - getAllAccessRequests - Query:', JSON.stringify(query));
        
        try {
            const { resources } = await container.items.query(query).fetchAll();
            console.log('DatabaseService - getAllAccessRequests - Fetched resources count:', resources.length);
            console.log('DatabaseService - getAllAccessRequests - Fetched resources (first 5):', JSON.stringify(resources.slice(0, 5)));
            return resources;
        } catch (error) {
            console.error('DatabaseService - getAllAccessRequests - Error fetching data:', error.message);
            console.error('DatabaseService - getAllAccessRequests - Error stack:', error.stack);
            throw error;
        }
    }
    
    static async updateAccessRequest(requestId, updateData, adminId) {
        const container = database.container(config.containers.accessRequests);
        const { resource: request } = await container.item(requestId, requestId).read();
        
        const updatedRequest = {
            ...request,
            ...updateData,
            reviewedBy: adminId,
            reviewedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        const { resource } = await container.item(requestId, requestId).replace(updatedRequest);
        return resource;
    }
    
    // ===== HELPER METHODS =====
    
    static async initializeDatabase() {
        try {
            // Create database if it doesn't exist
            await client.databases.createIfNotExists({ id: config.databaseId });
            
            // Create containers if they don't exist
            for (const containerName of Object.values(config.containers)) {
                await database.containers.createIfNotExists({ 
                    id: containerName,
                    partitionKey: { kind: 'Hash', paths: ['/id'] }
                });
            }
            
            console.log('Database initialized successfully');
            return true;
        } catch (error) {
            console.error('Database initialization failed:', error);
            return false;
        }
    }
}

module.exports = {
    DatabaseService,
    UserSchema,
    AccessRequestSchema,
    config
};