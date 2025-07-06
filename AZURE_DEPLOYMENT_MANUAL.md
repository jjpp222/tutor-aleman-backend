# Manual Azure Deployment Guide

## Step 1: Install Azure CLI

### macOS:
```bash
brew install azure-cli
```

### Or download from:
https://docs.microsoft.com/en-us/cli/azure/install-azure-cli

## Step 2: Install Azure Functions Core Tools

```bash
npm install -g azure-functions-core-tools@4 --unsafe-perm true
```

## Step 3: Login to Azure

```bash
az login
```

## Step 4: Create Function App (Using Azure Portal)

Since you already have the resources, we just need to create the Function App:

### Via Azure Portal:
1. Go to https://portal.azure.com
2. Click "Create a resource"
3. Search for "Function App"
4. Click "Create"

**Configuration:**
- **Subscription**: Azure for Students
- **Resource Group**: TutorAleman-RG (existing)
- **Function App name**: `tutor-aleman-api-jjpp` (must be globally unique)
- **Publish**: Code
- **Runtime stack**: Node.js
- **Version**: 18 LTS
- **Region**: East US
- **Storage Account**: tutoralemanstoragejjpp (existing)
- **Operating System**: Linux
- **Plan type**: Consumption (Serverless)

Click "Review + create" then "Create"

## Step 5: Configure Application Settings

In your Function App settings, go to "Configuration" and add these Application Settings:

```
COSMOS_DB_ENDPOINT = https://tutor-aleman-db-jjpp.documents.azure.com:443/
COSMOS_DB_KEY = [Get from Cosmos DB > Keys in Azure Portal]
JWT_SECRET = [Generate a random 32+ character string]
NODE_ENV = production
FUNCTIONS_WORKER_RUNTIME = node
```

**To get Cosmos DB Key:**
1. Go to your Cosmos DB account: `tutor-aleman-db-jjpp`
2. Click "Keys" in the left menu
3. Copy the "PRIMARY KEY"

**To generate JWT_SECRET:**
```bash
openssl rand -base64 32
```
Or use any secure random string generator.

## Step 6: Create Database and Container

### Via Azure Portal:
1. Go to your Cosmos DB account: `tutor-aleman-db-jjpp`
2. Click "Data Explorer"
3. Click "New Database"
   - Database id: `TutorAlemanDB`
   - Provision database throughput: Unchecked
4. Click "OK"
5. Right-click on the database and "New Container"
   - Container id: `users`
   - Partition key: `/id`
   - Throughput: 400 RU/s
6. Click "OK"

## Step 7: Deploy the Code

### Method A: Using VS Code (Recommended)

1. Install "Azure Functions" extension in VS Code
2. Open the TutorAlemanBackend folder
3. Click the Azure icon in the sidebar
4. Sign in to Azure
5. Right-click on your function app and select "Deploy to Function App"
6. Select the TutorAlemanBackend folder
7. Confirm deployment

### Method B: Using Azure Functions Core Tools

```bash
cd /Users/jjpp/TutorAlemanBackend
func azure functionapp publish tutor-aleman-api-jjpp
```

### Method C: Using ZIP Deploy

1. Create a ZIP file of your project:
   ```bash
   cd /Users/jjpp/TutorAlemanBackend
   zip -r tutor-aleman-backend.zip . -x "*.git*" "node_modules/*"
   ```

2. Go to your Function App in Azure Portal
3. Click "Deployment Center"
4. Choose "ZIP Deploy"
5. Upload your ZIP file

## Step 8: Test the Deployment

### Get Function URL:
Your function app URL will be: `https://tutor-aleman-api-jjpp.azurewebsites.net`

### Test endpoints:

1. **Health Check** (requires function key):
   - Get function key from Azure Portal > Function App > Functions > hello > Function Keys
   - Test: `https://tutor-aleman-api-jjpp.azurewebsites.net/api/hello?code=YOUR_FUNCTION_KEY`

2. **Register User**:
   ```bash
   curl -X POST https://tutor-aleman-api-jjpp.azurewebsites.net/api/register \
     -H "Content-Type: application/json" \
     -d '{"name":"Test User","email":"test@example.com","password":"TestPass123!"}'
   ```

3. **Login**:
   ```bash
   curl -X POST https://tutor-aleman-api-jjpp.azurewebsites.net/api/login \
     -H "Content-Type: application/json" \
     -d '{"email":"test@example.com","password":"TestPass123!"}'
   ```

## Step 9: Update Frontend Configuration

Edit `/Users/jjpp/TutorAlemanFrontend/script.js`:

```javascript
// Change this line:
const API_BASE_URL = 'http://localhost:7071/api';

// To this:
const API_BASE_URL = 'https://tutor-aleman-api-jjpp.azurewebsites.net/api';
```

## Step 10: Deploy Frontend

### Option A: Netlify (Free)

1. Go to https://netlify.com
2. Drag and drop the TutorAlemanFrontend folder
3. Your site will be live instantly

### Option B: GitHub Pages

1. Create a GitHub repository
2. Upload your frontend files
3. Enable GitHub Pages in repository settings

### Option C: Azure Static Web Apps

1. Go to Azure Portal
2. Create "Static Web App"
3. Connect to your GitHub repository
4. Configure build settings (none needed for static files)

## Troubleshooting

### Common Issues:

1. **Function App not starting**:
   - Check Application Settings are correct
   - Verify Cosmos DB connection string
   - Check Function App logs in Azure Portal

2. **Database connection errors**:
   - Verify Cosmos DB firewall settings
   - Check if database and container exist
   - Verify connection string format

3. **CORS errors**:
   - Check host.json CORS settings
   - Verify frontend URL in allowed origins

4. **Authentication errors**:
   - Verify JWT_SECRET is set
   - Check token format in requests
   - Verify user permissions

### View Logs:

In Azure Portal:
1. Go to your Function App
2. Click "Log stream" 
3. Monitor real-time logs

Or use Azure CLI:
```bash
func azure functionapp logstream tutor-aleman-api-jjpp
```

## Security Checklist

Before going live:

- [ ] JWT_SECRET is a strong, random string
- [ ] Cosmos DB firewall is configured
- [ ] Function App has HTTPS only enabled
- [ ] No secrets in source code
- [ ] CORS is configured for your domain only
- [ ] Application Insights is enabled for monitoring

## Final URLs

After deployment:

- **Backend API**: `https://tutor-aleman-api-jjpp.azurewebsites.net/api`
- **Frontend**: [Your chosen hosting platform URL]
- **Admin Dashboard**: Frontend URL (login with admin account)

## Creating First Admin User

1. Register a user through the frontend
2. Go to Cosmos DB Data Explorer
3. Find the user in the `users` container
4. Edit the document and change:
   ```json
   "role": "admin",
   "status": "active"
   ```
5. Save the document

Now you can login as admin and manage other users!