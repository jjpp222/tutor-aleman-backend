module.exports = async function (context, req) {
    context.log('Test admin endpoint');

    try {
        // Return mock data for testing frontend
        const mockRequests = [
            {
                id: "test-request-1",
                userId: "user-1", 
                email: "test@example.com",
                name: "Test",
                surname: "User",
                germanLevel: "B1",
                motivation: "Learning German for work",
                institution: "Test University",
                status: "pending",
                createdAt: new Date().toISOString(),
                reviewedBy: null,
                reviewedAt: null,
                adminNotes: null
            },
            {
                id: "test-request-2",
                userId: "user-2", 
                email: "student@example.com",
                name: "Maria",
                surname: "González",
                germanLevel: "A2",
                motivation: "Planning to study in Germany",
                institution: "Language Center",
                status: "pending",
                createdAt: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
                reviewedBy: null,
                reviewedAt: null,
                adminNotes: null
            }
        ];

        context.res = {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization'
            },
            body: {
                success: true,
                requests: mockRequests,
                totalRequests: mockRequests.length,
                filters: {
                    status: 'all'
                },
                message: 'Test endpoint working - mock data returned'
            }
        };

    } catch (error) {
        context.log.error('Test admin endpoint error:', error.message);

        context.res = {
            status: 500,
            body: {
                success: false,
                error: 'Test endpoint failed',
                message: error.message,
                timestamp: new Date().toISOString()
            }
        };
    }
};