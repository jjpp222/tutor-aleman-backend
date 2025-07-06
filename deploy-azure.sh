#!/bin/bash

# Azure Deployment Script for TutorAleman Backend
# Make sure you're logged into Azure CLI: az login

set -e  # Exit on any error

# Configuration - Update these values
RESOURCE_GROUP="TutorAleman-RG-v2"
LOCATION="swedencentral"
FUNCTION_APP_NAME="tutor-aleman-api-v2"
STORAGE_ACCOUNT="tutoralemanstorv2"
COSMOS_ACCOUNT="tutor-aleman-db-v2"
DATABASE_NAME="TutorAlemanDB"
CONTAINER_NAME="users"

echo "🚀 Starting Azure deployment for TutorAleman Backend..."

# Check if already logged in
echo "📝 Checking Azure login status..."
if ! az account show > /dev/null 2>&1; then
    echo "❌ Not logged into Azure. Please run 'az login' first."
    exit 1
fi

echo "✅ Azure login confirmed"

# Check if resource group exists
echo "📝 Checking if resource group exists..."
if ! az group show --name $RESOURCE_GROUP > /dev/null 2>&1; then
    echo "❌ Resource group $RESOURCE_GROUP not found. Please create it first."
    exit 1
fi

echo "✅ Resource group $RESOURCE_GROUP found"

# Check if storage account exists
echo "📝 Checking storage account..."
if ! az storage account show --name $STORAGE_ACCOUNT --resource-group $RESOURCE_GROUP > /dev/null 2>&1; then
    echo "❌ Storage account $STORAGE_ACCOUNT not found. Please create it first."
    exit 1
fi

echo "✅ Storage account $STORAGE_ACCOUNT found"

# Check if Cosmos DB exists
echo "📝 Checking Cosmos DB..."
if ! az cosmosdb show --name $COSMOS_ACCOUNT --resource-group $RESOURCE_GROUP > /dev/null 2>&1; then
    echo "❌ Cosmos DB $COSMOS_ACCOUNT not found. Please create it first."
    exit 1
fi

echo "✅ Cosmos DB $COSMOS_ACCOUNT found"

# Create Cosmos DB database if it doesn't exist
echo "📝 Creating Cosmos DB database if needed..."
az cosmosdb sql database create \
    --account-name $COSMOS_ACCOUNT \
    --resource-group $RESOURCE_GROUP \
    --name $DATABASE_NAME \
    --output none 2>/dev/null || echo "Database already exists"

# Create Cosmos DB containers if they don't exist
echo "📝 Creating Cosmos DB users container if needed..."
az cosmosdb sql container create \
    --account-name $COSMOS_ACCOUNT \
    --resource-group $RESOURCE_GROUP \
    --database-name $DATABASE_NAME \
    --name $CONTAINER_NAME \
    --partition-key-path "/id" \
    --throughput 400 \
    --output none 2>/dev/null || echo "Users container already exists"

echo "📝 Creating Cosmos DB conversations container if needed..."
az cosmosdb sql container create \
    --account-name $COSMOS_ACCOUNT \
    --resource-group $RESOURCE_GROUP \
    --database-name $DATABASE_NAME \
    --name "conversations" \
    --partition-key-path "/id" \
    --throughput 400 \
    --output none 2>/dev/null || echo "Conversations container already exists"

echo "📝 Creating Cosmos DB transcriptions container if needed..."
az cosmosdb sql container create \
    --account-name $COSMOS_ACCOUNT \
    --resource-group $RESOURCE_GROUP \
    --database-name $DATABASE_NAME \
    --name "transcriptions" \
    --partition-key-path "/id" \
    --throughput 400 \
    --output none 2>/dev/null || echo "Transcriptions container already exists"

# Create Function App
echo "📝 Creating Function App..."
az functionapp create \
    --resource-group $RESOURCE_GROUP \
    --consumption-plan-location "$LOCATION" \
    --runtime node \
    --runtime-version 18 \
    --functions-version 4 \
    --name $FUNCTION_APP_NAME \
    --storage-account $STORAGE_ACCOUNT \
    --os-type Linux \
    --output none || echo "Function App might already exist"

echo "✅ Function App created/verified"

# Get Cosmos DB connection details
echo "📝 Getting Cosmos DB connection details..."
COSMOS_ENDPOINT=$(az cosmosdb show --name $COSMOS_ACCOUNT --resource-group $RESOURCE_GROUP --query documentEndpoint --output tsv)
COSMOS_KEY=$(az cosmosdb keys list --name $COSMOS_ACCOUNT --resource-group $RESOURCE_GROUP --query primaryMasterKey --output tsv)

echo "✅ Retrieved Cosmos DB credentials"

# Generate a secure JWT secret
JWT_SECRET=$(openssl rand -base64 32)

# Set application settings
echo "📝 Configuring Function App settings..."
az functionapp config appsettings set \
    --name $FUNCTION_APP_NAME \
    --resource-group $RESOURCE_GROUP \
    --settings \
    COSMOS_DB_ENDPOINT="$COSMOS_ENDPOINT" \
    COSMOS_DB_KEY="$COSMOS_KEY" \
    COSMOS_DB_DATABASE_ID="TutorAlemanDB" \
    JWT_SECRET="$JWT_SECRET" \
    NODE_ENV="production" \
    WEBSITE_NODE_DEFAULT_VERSION="18" \
    FUNCTIONS_WORKER_RUNTIME="node" \
    AZURE_OPENAI_ENDPOINT="https://jorge-mchkyps4-swedencentral.openai.azure.com/" \
    AZURE_OPENAI_KEY="3H1RCr9eqD177bgsMAKMD4PVLUya0gsk1gGyz0kmovCrmmT6Jk0yJQQJ99BFACfhMk5XJ3w3AAAAACOGyU1S" \
    AZURE_OPENAI_DEPLOYMENT_NAME="SprachMeister-GPT4o" \
    --output none

echo "✅ Application settings configured"

# Build and deploy
echo "📝 Installing dependencies..."
npm install

echo "📝 Deploying to Azure Functions..."
func azure functionapp publish $FUNCTION_APP_NAME --javascript

# Get Function App URL
FUNCTION_URL="https://$FUNCTION_APP_NAME.azurewebsites.net"

echo ""
echo "🎉 Deployment completed successfully!"
echo ""
echo "📋 Deployment Summary:"
echo "├── Resource Group: $RESOURCE_GROUP"
echo "├── Function App: $FUNCTION_APP_NAME"
echo "├── Function URL: $FUNCTION_URL"
echo "├── Cosmos DB: $COSMOS_ACCOUNT"
echo "├── Database: $DATABASE_NAME"
echo "└── Container: $CONTAINER_NAME"
echo ""
echo "🔗 API Endpoints:"
echo "├── Health Check: $FUNCTION_URL/api/hello"
echo "├── Register: $FUNCTION_URL/api/register"
echo "├── Login: $FUNCTION_URL/api/login"
echo "├── Admin: $FUNCTION_URL/api/users/admin"
echo "├── Chat: $FUNCTION_URL/api/chat"
echo "├── Speech-to-Text: $FUNCTION_URL/api/speech/transcribe"
echo "├── Text-to-Speech: $FUNCTION_URL/api/speech/synthesize"
echo "└── Progress: $FUNCTION_URL/api/progress"
echo ""
echo "🔑 Important Notes:"
echo "├── JWT Secret has been auto-generated and configured"
echo "├── Update your frontend API_BASE_URL to: $FUNCTION_URL/api"
echo "├── The hello endpoint requires a function key for testing"
echo "└── Check the Azure portal for function keys"
echo ""
echo "✅ Ready for production use!"