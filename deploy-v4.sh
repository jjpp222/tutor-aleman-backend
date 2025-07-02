#!/bin/bash

# Simple deployment script for tutor-aleman-backend-v4
set -e

echo "🚀 Deploying to tutor-aleman-backend-v4..."

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Deploy using Azure Functions Core Tools
echo "📤 Deploying to Azure..."
func azure functionapp publish tutor-aleman-backend-v4 --build remote --typescript

echo "✅ Deployment complete!"
echo "🔗 Testing endpoint: https://tutor-aleman-backend-v4.azurewebsites.net/api/hello"