// Simple test to generate admin token for testing
const jwt = require('jsonwebtoken');

const JWT_SECRET = "tu-jwt-secret-super-seguro-minimo-32-caracteres-aqui";

// Generate admin token
const adminPayload = {
    userId: "admin-test-id",
    email: "admin@tutoraleman.com",
    role: "admin",
    status: "approved"
};

const token = jwt.sign(adminPayload, JWT_SECRET, { expiresIn: '24h' });

console.log('=== ADMIN TOKEN FOR TESTING ===');
console.log('Email: admin@tutoraleman.com');
console.log('Role: admin');
console.log('Token:', token);
console.log('===============================');

// Test endpoints with this token
console.log('\n=== TEST COMMANDS ===');
console.log('curl -X GET "https://tutor-aleman-backend-v4.azurewebsites.net/api/admin/requests" \\');
console.log('  -H "Content-Type: application/json" \\');
console.log('  -H "Authorization: Bearer ' + token + '"');
console.log('===================');