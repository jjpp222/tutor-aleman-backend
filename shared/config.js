// Shared configuration for all Azure Functions
const config = {
    // Azure Services
    cosmosDb: {
        endpoint: process.env.COSMOS_DB_ENDPOINT,
        key: process.env.COSMOS_DB_KEY,
        databaseId: process.env.COSMOS_DB_DATABASE_ID || 'TutorAlemanDB'
    },
    
    // Azure OpenAI
    openai: {
        endpoint: process.env.AZURE_OPENAI_ENDPOINT,
        key: process.env.AZURE_OPENAI_KEY,
        deploymentName: process.env.AZURE_OPENAI_DEPLOYMENT_NAME || 'SprachMeister-GPT4o'
    },
    
    // Azure Speech Services
    speech: {
        key: process.env.AZURE_SPEECH_KEY,
        region: process.env.AZURE_SPEECH_REGION || 'swedencentral'
    },
    
    // Azure Storage
    storage: {
        connectionString: process.env.AzureWebJobsStorage
    },
    
    // JWT
    jwt: {
        secret: process.env.JWT_SECRET || 'default-secret-change-in-production',
        expiresIn: '24h'
    },
    
    // CORS settings
    cors: {
        allowedOrigins: [
            'https://localhost:3000',
            'https://localhost:8080',
            'https://*.netlify.app',
            'https://*.vercel.app',
            'https://*.azurestaticapps.net'
        ],
        allowedMethods: ['GET', 'POST', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
    },
    
    // Validation
    validate() {
        const required = [
            'COSMOS_DB_ENDPOINT',
            'COSMOS_DB_KEY',
            'AZURE_OPENAI_ENDPOINT',
            'AZURE_OPENAI_KEY',
            'AZURE_SPEECH_KEY',
            'JWT_SECRET'
        ];
        
        const missing = required.filter(key => !process.env[key]);
        
        if (missing.length > 0) {
            throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
        }
        
        return true;
    }
};

module.exports = config;