#!/bin/bash

echo "🔧 Fix Azure Functions Deployment Issues"

# Fix WEBSITE_RUN_FROM_PACKAGE setting
echo "Removing WEBSITE_RUN_FROM_PACKAGE setting from Azure Functions..."

az functionapp config appsettings delete \
  --name tutor-aleman-backend-v4 \
  --resource-group DefaultResourceGroup-SWDC \
  --setting-names WEBSITE_RUN_FROM_PACKAGE

echo "✅ WEBSITE_RUN_FROM_PACKAGE setting removed"

# Restart function app to apply changes
echo "Restarting Function App..."
az functionapp restart \
  --name tutor-aleman-backend-v4 \
  --resource-group DefaultResourceGroup-SWDC

echo "✅ Function App restarted"

# Check if settings are properly configured
echo "Current Function App settings:"
az functionapp config appsettings list \
  --name tutor-aleman-backend-v4 \
  --resource-group DefaultResourceGroup-SWDC \
  --query "[].{name:name, value:value}" \
  --output table

echo "🎯 Azure Functions should now deploy correctly"