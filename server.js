const express = require('express');
const path = require('path');
const app = express();
const port = process.env.PORT || 8080;

// NOTE: This server.js file is typically used for local development or traditional Node.js deployments.
// When deploying to Azure Functions, each function (e.g., auth-login/index.js) runs independently
// and this Express server is generally NOT used. Ensure your Azure Functions are configured correctly
// to handle requests directly.

// Configurar CORS y headers de seguridad
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.header('X-Content-Type-Options', 'nosniff');
    res.header('X-Frame-Options', 'DENY');
    res.header('X-XSS-Protection', '1; mode=block');
    next();
});

// Servir archivos estáticos
app.use(express.static(__dirname, {
    setHeaders: (res, path) => {
        if (path.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache');
        }
    }
}));

// Ruta principal
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Rutas adicionales
app.get('/app', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend-final.html'));
});

app.get('/test', (req, res) => {
    res.sendFile(path.join(__dirname, 'test-simple.html'));
});

// Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        service: 'TutorAleman Frontend',
        version: '1.0.0'
    });
});

// Info del proyecto
app.get('/info', (req, res) => {
    res.json({
        name: 'Tutor Alemán Frontend',
        description: 'Frontend para conversación por voz con Azure TTS',
        backend: 'https://tutor-aleman-api-v2-d4aabgcvapg0ekfj.westeurope-01.azurewebsites.net/api',
        features: [
            'Reconocimiento de voz',
            'Azure TTS Premium',
            'Chat con GPT-4o',
            'Detección automática de idioma'
        ],
        status: 'Operativo'
    });
});

// Error handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Algo salió mal!' });
});

app.listen(port, () => {
    console.log(`🚀 TutorAleman Frontend running on port ${port}`);
    console.log(`📱 App URL: https://tutor-aleman-frontend.azurewebsites.net/`);
    console.log(`🏥 Health: https://tutor-aleman-frontend.azurewebsites.net/health`);
    console.log(`ℹ️ Info: https://tutor-aleman-frontend.azurewebsites.net/info`);
});