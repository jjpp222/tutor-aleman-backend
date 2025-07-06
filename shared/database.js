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
        accessRequests: 'AccessRequests',
        conversations: 'ConversationTranscripts'
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
    germanLevel: 'A1|A2|B1|B2|C1|C2',
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

// ===== CONVERSATION SCHEMA =====
const ConversationSchema = {
    id: 'string', // Auto-generated UUID
    sessionId: 'string', // Session identifier
    userId: 'string', // Reference to user (partition key)
    startTime: 'ISO8601',
    endTime: 'ISO8601', // null if active
    status: 'active|completed|paused',
    conversation: [
        {
            timestamp: 'ISO8601',
            speaker: 'user|tutor',
            originalAudio: 'string', // base64 audio data (optional)
            transcript: 'string', // User input or AI response
            language: 'string', // 'de' for German
            corrections: [
                {
                    original: 'string',
                    corrected: 'string',
                    type: 'grammar|pronunciation|vocabulary'
                }
            ]
        }
    ],
    metadata: {
        totalExchanges: 'number',
        duration: 'number', // in seconds
        topicsDiscussed: ['string'],
        errorsCorrections: 'number',
        germanLevel: 'string'
    }
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
    
    // ===== CONVERSATION OPERATIONS =====
    
    static async createConversation(userId, sessionId) {
        const container = database.container(config.containers.conversations);
        const conversation = {
            id: v4(),
            sessionId: sessionId,
            userId: userId,
            startTime: new Date().toISOString(),
            endTime: null,
            status: 'active',
            conversation: [],
            metadata: {
                totalExchanges: 0,
                duration: 0,
                topicsDiscussed: [],
                errorsCorrections: 0,
                germanLevel: 'B1'
            }
        };
        
        const { resource } = await container.items.create(conversation);
        return resource;
    }
    
    static async getActiveConversation(userId, sessionId) {
        const container = database.container(config.containers.conversations);
        const query = {
            query: 'SELECT * FROM c WHERE c.userId = @userId AND c.sessionId = @sessionId AND c.status = "active"',
            parameters: [
                { name: '@userId', value: userId },
                { name: '@sessionId', value: sessionId }
            ]
        };
        
        const { resources } = await container.items.query(query).fetchAll();
        return resources[0] || null;
    }
    
    static async addExchangeToConversation(conversationId, userId, exchange) {
        const container = database.container(config.containers.conversations);
        const { resource: conversation } = await container.item(conversationId, userId).read();
        
        // Add new exchange to conversation array
        conversation.conversation.push({
            timestamp: new Date().toISOString(),
            ...exchange
        });
        
        // Update metadata
        conversation.metadata.totalExchanges = conversation.conversation.length;
        conversation.metadata.duration = Math.floor((new Date() - new Date(conversation.startTime)) / 1000);
        
        const { resource } = await container.item(conversationId, userId).replace(conversation);
        return resource;
    }
    
    static async endConversation(conversationId, userId) {
        const container = database.container(config.containers.conversations);
        const { resource: conversation } = await container.item(conversationId, userId).read();
        
        conversation.status = 'completed';
        conversation.endTime = new Date().toISOString();
        conversation.metadata.duration = Math.floor((new Date(conversation.endTime) - new Date(conversation.startTime)) / 1000);
        
        const { resource } = await container.item(conversationId, userId).replace(conversation);
        return resource;
    }
    
    static async getConversationHistory(userId, limit = 10) {
        const container = database.container(config.containers.conversations);
        const query = {
            query: 'SELECT * FROM c WHERE c.userId = @userId ORDER BY c.startTime DESC OFFSET 0 LIMIT @limit',
            parameters: [
                { name: '@userId', value: userId },
                { name: '@limit', value: limit }
            ]
        };
        
        const { resources } = await container.items.query(query).fetchAll();
        return resources;
    }
    
    static async buildConversationContext(conversationId, userId, maxTokens = 100000) {
        const container = database.container(config.containers.conversations);
        const { resource: conversation } = await container.item(conversationId, userId).read();
        
        if (!conversation) return [];
        
        // Convert conversation exchanges to GPT-4o message format
        const messages = [];
        let estimatedTokens = 0;
        
        // Process messages in reverse order (most recent first)
        const reverseExchanges = [...conversation.conversation].reverse();
        
        for (const exchange of reverseExchanges) {
            let newMessage = null;
            
            if (exchange.speaker === 'user') {
                newMessage = { role: 'user', content: exchange.transcript };
            } else if (exchange.speaker === 'tutor') {
                newMessage = { role: 'assistant', content: exchange.transcript };
            }
            
            if (newMessage) {
                // Rough token estimation (1 token ≈ 4 characters for German)
                const messageTokens = Math.ceil(newMessage.content.length / 3);
                
                if (estimatedTokens + messageTokens > maxTokens) {
                    console.log(`Token limit reached. Truncating conversation history at ${messages.length} messages`);
                    break;
                }
                
                messages.unshift(newMessage); // Add to beginning to maintain chronological order
                estimatedTokens += messageTokens;
            }
        }
        
        console.log(`Conversation context built: ${messages.length} messages, ~${estimatedTokens} tokens`);
        return messages;
    }
    
    // ===== HELPER METHODS =====
    
    static async initializeDatabase() {
        try {
            // Create database if it doesn't exist
            await client.databases.createIfNotExists({ id: config.databaseId });
            
            // Create containers with specific partition keys
            const containerConfigs = [
                { name: config.containers.users, partitionKey: '/id' },
                { name: config.containers.sessions, partitionKey: '/id' },
                { name: config.containers.accessRequests, partitionKey: '/id' },
                { name: config.containers.conversations, partitionKey: '/userId' }
            ];
            
            for (const containerConfig of containerConfigs) {
                await database.containers.createIfNotExists({ 
                    id: containerConfig.name,
                    partitionKey: { kind: 'Hash', paths: [containerConfig.partitionKey] }
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