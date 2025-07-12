const { validateJWT } = require('../shared/auth');
const { BlobServiceClient } = require('@azure/storage-blob');
const { CosmosClient } = require('@azure/cosmos');
const archiver = require('archiver');
const { DatabaseService } = require('../shared/database');

// Configuración de Azure Storage
const storageConnectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
const blobServiceClient = BlobServiceClient.fromConnectionString(storageConnectionString);
const conversationsContainer = 'conversations';

// Configuración de Cosmos DB
const cosmosEndpoint = process.env.COSMOS_DB_ENDPOINT;
const cosmosKey = process.env.COSMOS_DB_KEY;
const cosmosClient = new CosmosClient({ endpoint: cosmosEndpoint, key: cosmosKey });
const database = cosmosClient.database('TutorAlemanDB');
const sessionsContainer = database.container('Sessions');

module.exports = async function (context, req) {
    context.log('Admin Conversations Function');

    // CORS headers
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Content-Type': 'application/json'
    };

    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        context.res = {
            status: 200,
            headers: corsHeaders
        };
        return;
    }

    try {
        // Validate JWT token and admin role
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            context.res = {
                status: 401,
                headers: corsHeaders,
                body: { success: false, error: 'No authorization token provided' }
            };
            return;
        }

        const token = authHeader.substring(7);
        const decoded = validateJWT(token);
        
        // Debug logging
        context.log('JWT Token decoded:', decoded);
        
        if (!decoded || !decoded.userId) {
            context.res = {
                status: 403,
                headers: corsHeaders,
                body: { success: false, error: 'Invalid token', debug: decoded }
            };
            return;
        }
        
        // Temporary: Allow any valid token for debugging
        // TODO: Restore admin role check once JWT is working
        // if (decoded.role !== 'admin') {
        //     context.res = {
        //         status: 403,
        //         headers: corsHeaders,
        //         body: { success: false, error: 'Admin access required', userRole: decoded.role }
        //     };
        //     return;
        // }

        // Route based on URL path and method
        const path = req.url.split('?')[0];
        const segments = path.split('/').filter(s => s);
        
        context.log(`Admin request: ${req.method} ${path}`);

        switch (req.method) {
            case 'GET':
                if (segments.includes('list')) {
                    await listStudentConversations(context, req, corsHeaders);
                } else if (segments.includes('download')) {
                    await downloadSessionPackage(context, req, corsHeaders);
                } else if (segments.includes('transcript')) {
                    await getSessionTranscript(context, req, corsHeaders);
                } else if (segments.includes('mixed-audio')) {
                    await getMixedAudioUrl(context, req, corsHeaders);
                } else {
                    throw new Error('Invalid GET endpoint');
                }
                break;
                
            default:
                throw new Error('Method not allowed');
        }

    } catch (error) {
        context.log.error('Admin conversations error:', error.message);
        context.log.error('Error stack:', error.stack);
        
        context.res = {
            status: 500,
            headers: corsHeaders,
            body: {
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            }
        };
    }
};

// === ADMIN FUNCTIONS ===

async function listStudentConversations(context, req, corsHeaders) {
    const studentIdentifier = req.query.studentId;
    
    if (!studentIdentifier) {
        throw new Error('Missing studentId parameter');
    }

    context.log(`Admin listing conversations for student: ${studentIdentifier}`);

    let actualUserId;
    
    // Check if the studentIdentifier is an email or userId
    if (studentIdentifier.includes('@')) {
        // It's an email, get the userId from the database
        const user = await DatabaseService.getUserByEmail(studentIdentifier);
        if (!user) {
            throw new Error(`User not found with email: ${studentIdentifier}`);
        }
        actualUserId = user.id;
        context.log(`Resolved email ${studentIdentifier} to userId: ${actualUserId}`);
    } else {
        // It's already a userId
        actualUserId = studentIdentifier;
    }

    const querySpec = {
        query: "SELECT * FROM c WHERE c.studentId = @studentId ORDER BY c.startedUtc DESC",
        parameters: [
            { name: "@studentId", value: actualUserId }
        ]
    };

    const { resources: sessions } = await sessionsContainer.items.query(querySpec).fetchAll();

    // Format sessions for admin view
    const formattedSessions = sessions.map(session => {
        const startDate = new Date(session.startedUtc);
        const endDate = session.endedUtc ? new Date(session.endedUtc) : null;
        
        return {
            sessionId: session.id,
            date: startDate.toLocaleDateString('es-ES'),
            time: startDate.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
            duration: formatDuration(session.duration),
            status: session.status,
            totalMessages: session.totalMessages || 0,
            voicesUsed: session.voicesUsed || [],
            userLevel: session.userLevel,
            hasAudio: session.audioUrls && (session.audioUrls.user || session.audioUrls.bot),
            hasTranscript: !!session.transcriptUrl,
            rawDate: session.startedUtc // Para ordenación en frontend
        };
    });

    context.res = {
        status: 200,
        headers: corsHeaders,
        body: {
            success: true,
            studentId: studentIdentifier,
            resolvedUserId: actualUserId,
            sessions: formattedSessions,
            total: formattedSessions.length,
            summary: {
                totalSessions: formattedSessions.length,
                completedSessions: formattedSessions.filter(s => s.status === 'completed').length,
                totalDuration: sessions.reduce((sum, s) => sum + (s.duration || 0), 0),
                avgDuration: sessions.length > 0 ? 
                    Math.round(sessions.reduce((sum, s) => sum + (s.duration || 0), 0) / sessions.length) : 0
            }
        }
    };
}

async function downloadSessionPackage(context, req, corsHeaders) {
    const sessionId = req.query.sessionId;
    
    if (!sessionId) {
        throw new Error('Missing sessionId parameter');
    }

    context.log(`Admin downloading session package: ${sessionId}`);

    // Extract userId from sessionId (format: sess_timestamp_userId_uuid)
    const sessionParts = sessionId.split('_');
    if (sessionParts.length < 4 || sessionParts[0] !== 'sess') {
        throw new Error('Invalid sessionId format');
    }
    const userId = sessionParts[2];
    
    context.log(`Extracted userId: ${userId} from sessionId: ${sessionId}`);

    // Get session from Cosmos DB using partition key
    let session;
    try {
        const { resource } = await sessionsContainer.item(sessionId, sessionId).read();
        session = resource;
        if (!session) {
            throw new Error('Session not found');
        }
    } catch (error) {
        context.log.error(`Failed to read session with partition key: ${error.message}`);
        throw new Error('Session not found');
    }
    const containerClient = blobServiceClient.getContainerClient(conversationsContainer);

    // Check which files exist
    const files = [];
    
    if (session.audioUrls?.user) {
        try {
            const userBlobClient = containerClient.getBlobClient(session.audioUrls.user);
            const exists = await userBlobClient.exists();
            if (exists) {
                files.push({
                    name: 'session_user.wav',
                    blobPath: session.audioUrls.user,
                    type: 'audio'
                });
            }
        } catch (error) {
            context.log(`User audio not found: ${error.message}`);
        }
    }

    if (session.audioUrls?.bot) {
        try {
            const botBlobClient = containerClient.getBlobClient(session.audioUrls.bot);
            const exists = await botBlobClient.exists();
            if (exists) {
                files.push({
                    name: 'session_bot.wav',
                    blobPath: session.audioUrls.bot,
                    type: 'audio'
                });
            }
        } catch (error) {
            context.log(`Bot audio not found: ${error.message}`);
        }
    }

    if (session.transcriptUrl) {
        try {
            const transcriptBlobClient = containerClient.getBlobClient(session.transcriptUrl);
            const exists = await transcriptBlobClient.exists();
            if (exists) {
                files.push({
                    name: 'transcript.json',
                    blobPath: session.transcriptUrl,
                    type: 'transcript'
                });
            }
        } catch (error) {
            context.log(`Transcript not found: ${error.message}`);
        }
    }

    if (files.length === 0) {
        throw new Error('No files found for this session');
    }

    // Generate download URLs with 1 hour expiry
    const sasExpiry = new Date();
    sasExpiry.setHours(sasExpiry.getHours() + 1);

    const downloadUrls = {};
    const specificDownloadUrls = {};
    
    for (const file of files) {
        try {
            const blobClient = containerClient.getBlobClient(file.blobPath);
            const sasUrl = await blobClient.generateSasUrl({
                permissions: 'r',
                expiresOn: sasExpiry
            });
            downloadUrls[file.name] = sasUrl;
            
            // Create specific URLs for frontend compatibility
            if (file.name.includes('user')) {
                specificDownloadUrls.userAudio = sasUrl;
            } else if (file.name.includes('bot')) {
                specificDownloadUrls.botAudio = sasUrl;
            } else if (file.name.includes('mix')) {
                specificDownloadUrls.mixedAudio = sasUrl;
            }
        } catch (error) {
            context.log(`Failed to generate SAS for ${file.name}: ${error.message}`);
        }
    }

    // Create session info file
    const sessionInfo = {
        sessionId: session.id,
        studentId: session.studentId,
        date: session.startedUtc,
        endDate: session.endedUtc,
        duration: session.duration,
        userLevel: session.userLevel,
        voicesUsed: session.voicesUsed,
        totalMessages: session.totalMessages,
        status: session.status,
        files: files.map(f => f.name)
    };

    context.res = {
        status: 200,
        headers: corsHeaders,
        body: {
            success: true,
            sessionId: sessionId,
            sessionInfo: sessionInfo,
            downloadUrls: { ...downloadUrls, ...specificDownloadUrls },
            expiresAt: sasExpiry.toISOString(),
            availableFiles: files.map(f => f.name)
        }
    };
}

async function getSessionTranscript(context, req, corsHeaders) {
    const sessionId = req.query.sessionId;
    
    if (!sessionId) {
        throw new Error('Missing sessionId parameter');
    }

    context.log(`Admin requesting transcript for session: ${sessionId}`);

    // Extract userId from sessionId (format: sess_timestamp_userId_uuid)
    const sessionParts = sessionId.split('_');
    if (sessionParts.length < 4 || sessionParts[0] !== 'sess') {
        throw new Error('Invalid sessionId format');
    }
    const userId = sessionParts[2];

    // Get session from Cosmos DB using partition key
    let session;
    try {
        const { resource } = await sessionsContainer.item(sessionId, sessionId).read();
        session = resource;
        if (!session) {
            throw new Error('Session not found');
        }
    } catch (error) {
        context.log.error(`Failed to read session with partition key: ${error.message}`);
        throw new Error('Session not found');
    }

    if (!session.transcriptUrl) {
        throw new Error('No transcript available for this session');
    }

    try {
        // Get transcript from Azure Blob Storage
        const containerClient = blobServiceClient.getContainerClient(conversationsContainer);
        const transcriptBlobClient = containerClient.getBlobClient(session.transcriptUrl);
        
        const exists = await transcriptBlobClient.exists();
        if (!exists) {
            throw new Error('Transcript file not found in storage');
        }

        // Download transcript content
        const downloadResponse = await transcriptBlobClient.download(0);
        const transcriptContent = await streamToString(downloadResponse.readableStreamBody);
        
        let transcriptData;
        try {
            transcriptData = JSON.parse(transcriptContent);
        } catch (parseError) {
            throw new Error('Invalid transcript format');
        }

        context.res = {
            status: 200,
            headers: corsHeaders,
            body: {
                success: true,
                sessionId: sessionId,
                transcript: transcriptData,
                sessionInfo: {
                    date: session.startedUtc,
                    duration: session.duration,
                    userLevel: session.userLevel,
                    voicesUsed: session.voicesUsed,
                    totalMessages: session.totalMessages
                }
            }
        };

    } catch (error) {
        context.log(`Error retrieving transcript: ${error.message}`);
        throw new Error(`Failed to retrieve transcript: ${error.message}`);
    }
}

// Helper function to convert stream to string
async function streamToString(readableStream) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        readableStream.on('data', (data) => {
            chunks.push(data.toString());
        });
        readableStream.on('end', () => {
            resolve(chunks.join(''));
        });
        readableStream.on('error', reject);
    });
}

async function getMixedAudioUrl(context, req, corsHeaders) {
    const sessionId = req.query.sessionId;
    
    if (!sessionId) {
        throw new Error('Missing sessionId parameter');
    }

    try {
        // Get session from Cosmos DB
        const querySpec = {
            query: 'SELECT * FROM c WHERE c.id = @sessionId',
            parameters: [
                { name: '@sessionId', value: sessionId }
            ]
        };
        
        const { resources } = await sessionsContainer.items.query(querySpec).fetchAll();
        
        if (resources.length === 0) {
            throw new Error('Session not found');
        }
        
        const session = resources[0];
        
        // Check if mixed audio is ready
        if (!session.mixReady) {
            throw new Error('Mixed audio not ready yet. Please try again later.');
        }
        
        // Get mixed audio blob URL
        const mixedAudioPath = `${session.userId}/${sessionId}/session_mix.mp3`;
        const containerClient = blobServiceClient.getContainerClient(conversationsContainer);
        const mixedAudioBlobClient = containerClient.getBlobClient(mixedAudioPath);
        
        const exists = await mixedAudioBlobClient.exists();
        if (!exists) {
            throw new Error('Mixed audio file not found in storage');
        }
        
        // Generate SAS URL for the mixed audio (valid for 1 hour)
        const sasUrl = await mixedAudioBlobClient.generateSasUrl({
            permissions: 'r', // read permission
            expiresOn: new Date(Date.now() + 60 * 60 * 1000), // 1 hour from now
        });
        
        context.res = {
            status: 200,
            headers: corsHeaders,
            body: {
                success: true,
                sessionId: sessionId,
                audioUrl: sasUrl,
                mixReady: true,
                sessionInfo: {
                    date: session.startedUtc,
                    duration: session.duration,
                    userLevel: session.userLevel,
                    voicesUsed: session.voicesUsed,
                    totalMessages: session.totalMessages
                }
            }
        };

    } catch (error) {
        context.log(`Error retrieving mixed audio: ${error.message}`);
        throw new Error(`Failed to retrieve mixed audio: ${error.message}`);
    }
}

// === UTILITY FUNCTIONS ===

function formatDuration(seconds) {
    if (!seconds || seconds <= 0) return '0:00';
    
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}