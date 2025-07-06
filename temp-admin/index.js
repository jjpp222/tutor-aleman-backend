const { app } = require('@azure/functions');

app.http('temp-admin', {
    methods: ['GET', 'POST', 'OPTIONS'],
    authLevel: 'anonymous',
    route: 'admin/requests',
    handler: async (request, context) => {
        context.log('Temp admin endpoint accessed');
        
        // CORS headers
        const headers = {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        };

        // Handle OPTIONS
        if (request.method === 'OPTIONS') {
            return {
                status: 200,
                headers: headers,
                body: ''
            };
        }

        // Return mock data for admin panel
        const mockData = {
            success: true,
            requests: [
                {
                    id: "temp-1",
                    userId: "user-1",
                    email: "test1@example.com",
                    name: "Ana",
                    surname: "García", 
                    germanLevel: "B1",
                    motivation: "Quiero estudiar en Alemania",
                    institution: "Universidad Central",
                    status: "pending",
                    createdAt: new Date().toISOString(),
                    reviewedBy: null,
                    reviewedAt: null,
                    adminNotes: null
                },
                {
                    id: "temp-2", 
                    userId: "user-2",
                    email: "test2@example.com",
                    name: "Carlos",
                    surname: "López",
                    germanLevel: "A2", 
                    motivation: "Trabajo en empresa alemana",
                    institution: "Instituto de Idiomas",
                    status: "pending",
                    createdAt: new Date(Date.now() - 3600000).toISOString(),
                    reviewedBy: null,
                    reviewedAt: null,
                    adminNotes: null
                }
            ],
            totalRequests: 2
        };

        return {
            status: 200,
            headers: headers,
            body: JSON.stringify(mockData)
        };
    }
});