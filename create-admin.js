const { CosmosClient } = require('@azure/cosmos');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

// Cosmos DB configuration
const cosmosClient = new CosmosClient({
    endpoint: process.env.COSMOS_DB_ENDPOINT || 'https://your-cosmos-db.documents.azure.com:443/',
    key: process.env.COSMOS_DB_KEY || 'your-cosmos-db-key'
});

const database = cosmosClient.database('TutorAlemanDB');
const usersContainer = database.container('Users');

async function createAdminUser() {
    const adminId = uuidv4();
    const adminEmail = 'admin@tutoraleman.com';
    const adminPassword = 'AdminPass123!';
    
    // Create password hash using bcrypt
    const passwordHash = await bcrypt.hash(adminPassword, 12); // 12 is the salt rounds
    
    const adminUser = {
        id: adminId,
        email: adminEmail,
        name: 'Administrador del Sistema',
        hashedPassword: passwordHash,
        role: 'admin',
        status: 'active', // Admin starts active
        dateOfBirth: '1990-01-01',
        nationality: 'ES',
        currentLevel: 'C2',
        studyGoals: 'Administración del sistema',
        consentAudio: true,
        consentPrivacy: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    
    try {
        // Check if admin already exists
        const querySpec = {
            query: 'SELECT * FROM c WHERE c.email = @email',
            parameters: [{ name: '@email', value: adminEmail }]
        };
        
        const { resources: existingUsers } = await usersContainer.items.query(querySpec).fetchAll();
        
        if (existingUsers.length > 0) {
            console.log('Admin user already exists:', existingUsers[0].id);
            return existingUsers[0];
        }
        
        // Create admin user
        const { resource: createdUser } = await usersContainer.items.create(adminUser);
        console.log('Admin user created successfully:');
        console.log('ID:', createdUser.id);
        console.log('Email:', createdUser.email);
        console.log('Password Hash:', createdUser.hashedPassword);
        
        return createdUser;
        
    } catch (error) {
        console.error('Error creating admin user:', error);
        throw error;
    }
}

// Run the creation
createAdminUser()
    .then(() => {
        console.log('Done');
        process.exit(0);
    })
    .catch(error => {
        console.error('Failed:', error);
        process.exit(1);
    });