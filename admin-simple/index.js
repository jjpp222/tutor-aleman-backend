module.exports = async function (context, req) {
    context.log('Admin simple endpoint called');

    // Set CORS headers
    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    };

    // Handle OPTIONS (preflight)
    if (req.method === 'OPTIONS') {
        context.res = {
            status: 200,
            headers: headers,
            body: ''
        };
        return;
    }

    try {
        context.log(`Method: ${req.method}`);
        context.log(`Query: ${JSON.stringify(req.query)}`);

        if (req.method === 'GET') {
            // Return mock admin data
            const mockData = {
                success: true,
                message: 'Admin simple endpoint working!',
                requests: [
                    {
                        id: "simple-test-1",
                        userId: "user-test-1",
                        email: "test1@example.com", 
                        name: "Ana",
                        surname: "García",
                        germanLevel: "B1",
                        motivation: "Estudiar en Alemania",
                        institution: "Universidad Central",
                        status: "pending",
                        createdAt: new Date().toISOString(),
                        reviewedBy: null,
                        reviewedAt: null,
                        adminNotes: null
                    },
                    {
                        id: "simple-test-2",
                        userId: "user-test-2", 
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
                totalRequests: 2,
                filters: {
                    status: req.query.status || 'all'
                },
                timestamp: new Date().toISOString()
            };

            context.res = {
                status: 200,
                headers: headers,
                body: mockData
            };

        } else if (req.method === 'POST') {
            // Handle approve/reject actions
            const mockResponse = {
                success: true,
                message: 'Action processed successfully (mock)',
                action: 'approve',
                requestId: 'mock-id',
                timestamp: new Date().toISOString()
            };

            context.res = {
                status: 200,
                headers: headers,
                body: mockResponse
            };

        } else {
            context.res = {
                status: 405,
                headers: headers,
                body: {
                    success: false,
                    error: 'Method not allowed',
                    allowedMethods: ['GET', 'POST', 'OPTIONS']
                }
            };
        }

    } catch (error) {
        context.log.error('Admin simple error:', error);

        context.res = {
            status: 500,
            headers: headers,
            body: {
                success: false,
                error: 'Internal server error',
                message: error.message,
                timestamp: new Date().toISOString()
            }
        };
    }
};