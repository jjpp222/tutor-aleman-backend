#!/bin/bash

# Azure Services Setup Script for TutorAleman Backend
# This script creates Azure Speech Services and Blob Storage

set -e  # Exit on any error

# Configuration - Update these values to match your existing setup
RESOURCE_GROUP="TutorAleman-RG-v2"
LOCATION="swedencentral"
SPEECH_SERVICE_NAME="tutor-aleman-speech-v2"
STORAGE_ACCOUNT="tutoralemanstorv2"
FUNCTION_APP_NAME="tutor-aleman-api-v2"

echo "🚀 Setting up Azure services for TutorAleman voice features..."

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

# Create Azure Speech Services
echo "📝 Creating Azure Speech Services..."
az cognitiveservices account create \
    --name $SPEECH_SERVICE_NAME \
    --resource-group $RESOURCE_GROUP \
    --location $LOCATION \
    --kind SpeechServices \
    --sku F0 \
    --output none || echo "Speech service might already exist"

echo "✅ Azure Speech Services created/verified"

# Check if storage account exists, if not create it
echo "📝 Checking storage account..."
if ! az storage account show --name $STORAGE_ACCOUNT --resource-group $RESOURCE_GROUP > /dev/null 2>&1; then
    echo "📝 Creating storage account..."
    az storage account create \
        --name $STORAGE_ACCOUNT \
        --resource-group $RESOURCE_GROUP \
        --location $LOCATION \
        --sku Standard_LRS \
        --kind StorageV2 \
        --access-tier Hot \
        --output none
    echo "✅ Storage account created"
else
    echo "✅ Storage account already exists"
fi

# Create blob container for audio files
echo "📝 Creating blob container for audio files..."
STORAGE_KEY=$(az storage account keys list --account-name $STORAGE_ACCOUNT --resource-group $RESOURCE_GROUP --query '[0].value' --output tsv)

az storage container create \
    --name "audio-recordings" \
    --account-name $STORAGE_ACCOUNT \
    --account-key "$STORAGE_KEY" \
    --public-access off \
    --output none || echo "Container might already exist"

echo "✅ Blob container created/verified"

# Get service keys
echo "📝 Retrieving service keys..."
SPEECH_KEY=$(az cognitiveservices account keys list --name $SPEECH_SERVICE_NAME --resource-group $RESOURCE_GROUP --query key1 --output tsv)
STORAGE_CONNECTION_STRING=$(az storage account show-connection-string --name $STORAGE_ACCOUNT --resource-group $RESOURCE_GROUP --query connectionString --output tsv)

echo "✅ Service keys retrieved"

# Configure Function App with new environment variables
echo "📝 Configuring Function App environment variables..."
az functionapp config appsettings set \
    --name $FUNCTION_APP_NAME \
    --resource-group $RESOURCE_GROUP \
    --settings \
    AZURE_SPEECH_KEY="$SPEECH_KEY" \
    AZURE_SPEECH_REGION="$LOCATION" \
    AZURE_STORAGE_CONNECTION_STRING="$STORAGE_CONNECTION_STRING" \
    --output none

echo "✅ Function App configured with new environment variables"

echo ""
echo "🎉 Azure services setup completed successfully!"
echo ""
echo "📋 Services Created/Configured:"
echo "├── Speech Service: $SPEECH_SERVICE_NAME"
echo "├── Storage Account: $STORAGE_ACCOUNT"
echo "├── Blob Container: audio-recordings"
echo "└── Function App: $FUNCTION_APP_NAME (updated with new env vars)"
echo ""
echo "🔑 Environment Variables Set:"
echo "├── AZURE_SPEECH_KEY: [CONFIGURED]"
echo "├── AZURE_SPEECH_REGION: $LOCATION"
echo "└── AZURE_STORAGE_CONNECTION_STRING: [CONFIGURED]"
echo ""
echo "✅ Your TutorAleman backend is now ready for voice features!"
echo ""
echo "🔄 Next steps:"
echo "1. Deploy your updated functions: func azure functionapp publish $FUNCTION_APP_NAME"
echo "2. Test the speech endpoints"
echo "3. Configure CORS for your frontend"