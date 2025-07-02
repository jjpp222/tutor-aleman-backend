const jwt = require('jsonwebtoken');

// Este es el mismo JWT_SECRET que usa el sistema
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-in-production';

// Crear token de administrador temporal
const adminToken = jwt.sign(
    {
        userId: 'admin-temp-001',
        email: 'admin@tutoraleman.com',
        role: 'admin',
        name: 'Admin Temporal'
    },
    JWT_SECRET,
    { expiresIn: '1h' }
);

console.log('Token de administrador temporal:');
console.log(adminToken);
console.log('\nPuedes usar este token para aprobar usuarios:');
console.log(`Authorization: Bearer ${adminToken}`);