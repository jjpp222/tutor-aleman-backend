const fs = require('fs');
const path = require('path');

module.exports = async function (context, req) {
    context.log('Frontend app request received');

    try {
        // Read the index.html file
        const htmlPath = path.join(__dirname, '..', 'index.html');
        const htmlContent = fs.readFileSync(htmlPath, 'utf8');

        context.res = {
            status: 200,
            headers: {
                'Content-Type': 'text/html; charset=utf-8',
                'Cache-Control': 'no-cache'
            },
            body: htmlContent
        };
    } catch (error) {
        context.log.error('Error serving frontend:', error);
        context.res = {
            status: 500,
            headers: {
                'Content-Type': 'text/html'
            },
            body: `
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Tutor Alemán - Cargando...</title>
                    <style>
                        body { font-family: Arial; text-align: center; padding: 50px; background: linear-gradient(45deg, #667eea, #764ba2); color: white; }
                        .loading { font-size: 24px; margin: 20px; }
                        .retry { background: #4CAF50; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; }
                    </style>
                </head>
                <body>
                    <h1>🇩🇪 Tutor Alemán</h1>
                    <div class="loading">Inicializando aplicación...</div>
                    <p>La aplicación se está cargando. Si no funciona, intenta:</p>
                    <button class="retry" onclick="window.location.reload()">🔄 Recargar Página</button>
                    <p><small>Error: ${error.message}</small></p>
                </body>
                </html>
            `
        };
    }
};