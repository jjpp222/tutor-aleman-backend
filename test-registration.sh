#!/bin/bash

echo "Testing registration endpoint..."

# Create temporary JSON file
cat > /tmp/register_data.json << 'EOF'
{
  "firstName": "Test",
  "lastName": "User", 
  "email": "test@example.com",
  "password": "TestPass123!",
  "birthDate": "1990-01-01",
  "germanLevel": "B1",
  "learningGoals": "Improve conversation skills",
  "consentRecording": true,
  "acceptPrivacyPolicy": true
}
EOF

echo "JSON payload:"
cat /tmp/register_data.json

echo -e "\nSending request..."
curl -X POST "https://tutor-aleman-api-v2-d4aabgcvapg0ekfj.westeurope-01.azurewebsites.net/api/registeruser" \
  -H "Content-Type: application/json; charset=utf-8" \
  -d @/tmp/register_data.json \
  -w "\nHTTP Status: %{http_code}\n" \
  --max-time 30

echo -e "\nCleaning up..."
rm /tmp/register_data.json