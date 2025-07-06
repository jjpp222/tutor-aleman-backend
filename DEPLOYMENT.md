# Deployment Guide for TutorAlemanBackend

## Prerequisites

1. **Azure Account** with an active subscription
2. **Azure CLI** installed and logged in
3. **Node.js 18+** installed locally
4. **Azure Functions Core Tools** v4 installed

## Environment Setup

### 1. Environment Variables

Copy `.env.example` to `.env` (for local development) and configure the following:

```bash
# Required for production
COSMOS_DB_ENDPOINT=https://your-cosmos-account.documents.azure.com:443/
COSMOS_DB_KEY=your-cosmos-db-primary-key
JWT_SECRET=your-super-secure-jwt-secret-minimum-32-characters
AzureWebJobsStorage=your-azure-storage-connection-string
```

### 2. Azure Resources Setup

#### Create Resource Group
```bash
az group create --name tutor-aleman-rg --location "East US"
```

#### Create Cosmos DB Account
```bash
az cosmosdb create \
  --name tutor-aleman-cosmos \
  --resource-group tutor-aleman-rg \
  --default-consistency-level Session \
  --locations regionName="East US" failoverPriority=0 isZoneRedundant=False
```

#### Create Cosmos DB Database and Container
```bash
# Create database
az cosmosdb sql database create \
  --account-name tutor-aleman-cosmos \
  --resource-group tutor-aleman-rg \
  --name TutorAlemanDB

# Create users container
az cosmosdb sql container create \
  --account-name tutor-aleman-cosmos \
  --resource-group tutor-aleman-rg \
  --database-name TutorAlemanDB \
  --name users \
  --partition-key-path "/id" \
  --throughput 400
```

#### Create Storage Account
```bash
az storage account create \
  --name tutoralemanstorage \
  --resource-group tutor-aleman-rg \
  --location "East US" \
  --sku Standard_LRS
```

#### Create Function App
```bash
az functionapp create \
  --resource-group tutor-aleman-rg \
  --consumption-plan-location "East US" \
  --runtime node \
  --runtime-version 18 \
  --functions-version 4 \
  --name tutor-aleman-api \
  --storage-account tutoralemanstorage \
  --os-type Linux
```

### 3. Configure Application Settings

```bash
# Get Cosmos DB connection details
COSMOS_ENDPOINT=$(az cosmosdb show --name tutor-aleman-cosmos --resource-group tutor-aleman-rg --query documentEndpoint --output tsv)
COSMOS_KEY=$(az cosmosdb keys list --name tutor-aleman-cosmos --resource-group tutor-aleman-rg --query primaryMasterKey --output tsv)

# Set application settings
az functionapp config appsettings set \
  --name tutor-aleman-api \
  --resource-group tutor-aleman-rg \
  --settings \
  COSMOS_DB_ENDPOINT="$COSMOS_ENDPOINT" \
  COSMOS_DB_KEY="$COSMOS_KEY" \
  JWT_SECRET="your-super-secure-jwt-secret-minimum-32-characters" \
  NODE_ENV="production"
```

## Deployment Steps

### 1. Local Testing
```bash
# Install dependencies
npm install

# Start local development server
npm run dev
```

### 2. Deploy to Azure
```bash
# Deploy using Azure Functions Core Tools
func azure functionapp publish tutor-aleman-api
```

### 3. Verify Deployment
```bash
# Test health endpoint
curl https://tutor-aleman-api.azurewebsites.net/api/hello?code=your-function-key

# Test user registration
curl -X POST https://tutor-aleman-api.azurewebsites.net/api/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"SecurePass123!","name":"Test User"}'
```

## Security Considerations

### 1. Secrets Management
- **Never commit secrets** to version control
- Use **Azure Key Vault** for production secrets
- Rotate JWT secrets regularly

### 2. Network Security
- Configure **IP restrictions** on Function App
- Use **Private Endpoints** for Cosmos DB
- Enable **HTTPS only**

### 3. Authentication
- Admin endpoints require JWT tokens with admin role
- All passwords are hashed with bcrypt (12 rounds)
- User accounts require admin approval

### 4. Monitoring
- Enable **Application Insights** for logging
- Set up **alerts** for failures and high latency
- Monitor **Cosmos DB** RU consumption

## Environment-Specific Configurations

### Development
```bash
CORS_ALLOWED_ORIGINS=http://localhost:3000
NODE_ENV=development
```

### Production
```bash
CORS_ALLOWED_ORIGINS=https://your-frontend-domain.com
NODE_ENV=production
```

## API Endpoints

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/register` | POST | None | User registration |
| `/api/login` | POST | None | User authentication |
| `/api/users/admin` | GET | Admin JWT | Get pending users |
| `/api/users/admin` | POST | Admin JWT | Approve/reject users |
| `/api/hello` | GET | Function Key | Health check |

## Troubleshooting

### Common Issues

1. **Cosmos DB Connection Failed**
   - Verify endpoint and key in application settings
   - Check firewall rules

2. **JWT Token Invalid**
   - Ensure JWT_SECRET is set correctly
   - Check token expiration

3. **CORS Issues**
   - Verify CORS settings in host.json
   - Check allowed origins configuration

### Logs and Debugging

```bash
# View function logs
func azure functionapp logstream tutor-aleman-api

# Check application settings
az functionapp config appsettings list --name tutor-aleman-api --resource-group tutor-aleman-rg
```

## Maintenance

### Regular Tasks
1. **Update dependencies** monthly
2. **Review logs** for security issues
3. **Monitor performance** metrics
4. **Backup Cosmos DB** data
5. **Rotate secrets** quarterly

### Scaling
- Monitor RU consumption in Cosmos DB
- Consider upgrading to Premium Functions plan for high traffic
- Implement caching for frequently accessed data