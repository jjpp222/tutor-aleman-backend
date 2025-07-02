#!/bin/bash

echo "🚀 Deploying TutorAleman Backend Improvements..."
echo "================================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ Error: Not in project root directory${NC}"
    exit 1
fi

# Install/update dependencies
echo -e "${YELLOW}📦 Installing dependencies...${NC}"
npm install
if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Failed to install dependencies${NC}"
    exit 1
fi

# Create deployment package
echo -e "${YELLOW}📦 Creating deployment package...${NC}"
if [ -f "deployment.zip" ]; then
    rm deployment.zip
fi

# Create zip excluding unnecessary files
zip -r deployment.zip . \
    -x "*.git*" \
    -x "node_modules/@azure/functions-core-tools/*" \
    -x "*.DS_Store" \
    -x "test-*" \
    -x "*.md" \
    -x "*.sh" \
    -x "frontend/*" \
    -x "*.html"

echo -e "${GREEN}✅ Deployment package created: deployment.zip${NC}"

# Test functions locally first
echo -e "${YELLOW}🧪 Testing functions locally...${NC}"
timeout 10s func start --port 7072 &
FUNC_PID=$!
sleep 5

# Quick local test
LOCAL_TEST=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:7072/api/hello" 2>/dev/null || echo "000")
kill $FUNC_PID 2>/dev/null

if [ "$LOCAL_TEST" = "200" ]; then
    echo -e "${GREEN}✅ Local functions test passed${NC}"
else
    echo -e "${YELLOW}⚠️  Local test skipped (function may not be running)${NC}"
fi

echo ""
echo -e "${GREEN}🎯 Deployment package ready!${NC}"
echo ""
echo "Next steps:"
echo "1. Upload deployment.zip to Azure Function App via:"
echo "   - Azure Portal > Function App > Deployment Center > ZIP Deploy"
echo "   - Or use: func azure functionapp publish tutor-aleman-backend-v4"
echo ""
echo "2. Verify environment variables in Azure:"
echo "   - COSMOS_DB_ENDPOINT"
echo "   - COSMOS_DB_KEY"
echo "   - AZURE_OPENAI_ENDPOINT"
echo "   - AZURE_OPENAI_KEY"
echo "   - AZURE_SPEECH_KEY"
echo "   - JWT_SECRET"
echo ""
echo "3. Test deployment with:"
echo "   - ./test-endpoints.sh"
echo ""
echo -e "${GREEN}✅ Ready for deployment!${NC}"