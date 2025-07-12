const { validateJWT } = require('../shared/auth');
const { BlobServiceClient } = require('@azure/storage-blob');
const { CosmosClient } = require('@azure/cosmos');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const fetch = require('node-fetch');

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
    context.log('Conversation Session Management Function');

    // CORS headers
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
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
        // Validate JWT token
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
        
        if (!decoded || !decoded.userId) {
            context.res = {
                status: 401,
                headers: corsHeaders,
                body: { success: false, error: 'Invalid token' }
            };
            return;
        }

        const userId = decoded.userId;
        const userLevel = decoded.cefr || 'B1';

        // Route based on URL path and method
        const path = req.url.split('?')[0];
        const segments = path.split('/').filter(s => s);
        
        context.log(`Processing request: ${req.method} ${path}`);
        context.log(`URL segments: ${JSON.stringify(segments)}`);

        switch (req.method) {
            case 'POST':
                if (segments.includes('start')) {
                    await startSession(context, req, corsHeaders, userId, userLevel);
                } else if (segments.includes('append-bot-audio')) {
                    await appendBotAudio(context, req, corsHeaders, userId);
                } else if (segments.includes('append')) {
                    await appendTurn(context, req, corsHeaders, userId);
                } else if (segments.includes('end')) {
                    await endSession(context, req, corsHeaders, userId);
                } else {
                    throw new Error('Invalid POST endpoint');
                }
                break;
                
            case 'GET':
                if (segments.includes('list')) {
                    await listSessions(context, req, corsHeaders, userId);
                } else if (segments.includes('download')) {
                    await downloadSession(context, req, corsHeaders, userId);
                } else {
                    throw new Error('Invalid GET endpoint');
                }
                break;
                
            default:
                throw new Error('Method not allowed');
        }

    } catch (error) {
        context.log.error('Session management error:', error.message);
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

// === SESSION MANAGEMENT FUNCTIONS ===

async function startSession(context, req, corsHeaders, userId, userLevel) {
    context.log(`Starting new session for user: ${userId}`);
    context.log(`User ID from token in startSession: ${userId}`); // <-- NUEVO LOG
    
    const sessionId = `sess_${Date.now()}_${userId}_${uuidv4().substring(0, 8)}`;
    const startTime = new Date().toISOString();
    
    // Create session document in Cosmos DB
    const sessionDoc = {
        id: sessionId,
        studentId: userId,
        userId: userId, // Explicit partition key property
        startedUtc: startTime,
        endedUtc: null,
        status: 'active',
        userLevel: userLevel,
        voicesUsed: [],
        totalMessages: 0,
        duration: 0,
        audioUrls: {
            user: null,
            bot: null
        },
        transcriptUrl: null,
        createdAt: startTime
    };

    try {
        await sessionsContainer.items.create(sessionDoc, { partitionKey: userId });
        context.log(`Session document created: ${sessionId}`);
    } catch (error) {
        context.log.error(`Failed to create session document: ${error.message}`);
        throw new Error('Failed to initialize session');
    }

    // Generate SAS URIs for file uploads
    const containerClient = blobServiceClient.getContainerClient(conversationsContainer);
    
    // Ensure container exists
    await containerClient.createIfNotExists();
    
    const sasExpiry = new Date();
    sasExpiry.setHours(sasExpiry.getHours() + 2); // 2 hours expiry
    
    const botAudioPath = `${userId}/${sessionId}/session_bot.mp3`;
    const transcriptPath = `${userId}/${sessionId}/transcript.json`;
    
    // Generate SAS URLs for uploads (only transcript needed in new system)
    const botAudioSAS = await generateSASUrl(containerClient, botAudioPath, 'w', sasExpiry);
    const transcriptSAS = await generateSASUrl(containerClient, transcriptPath, 'w', sasExpiry);

    context.res = {
        status: 200,
        headers: corsHeaders,
        body: {
            success: true,
            sessionId: sessionId,
            uploadUrls: {
                botAudio: botAudioSAS,
                transcript: transcriptSAS
            },
            expiresAt: sasExpiry.toISOString(),
            message: 'Session started successfully'
        }
    };
}

async function appendTurn(context, req, corsHeaders, userId) {
    const { sessionId, speaker, text, offsetMs, durationMs, voiceUsed } = req.body || {};
    
    if (!sessionId || !speaker || !text) {
        throw new Error('Missing required fields: sessionId, speaker, text');
    }

    context.log(`Appending turn to session: ${sessionId}, speaker: ${speaker}`);

    // Get session from Cosmos DB
    context.log(`Attempting to read session: ${sessionId} with userId: ${userId}`);
    const { resource: session } = await sessionsContainer.item(sessionId, userId).read();
    context.log(`Session read result:`, session ? { id: session.id, status: session.status, userId: session.userId } : 'NULL');
    
    if (!session || session.status !== 'active') {
        context.log.error(`Session validation failed - Session exists: ${!!session}, Status: ${session?.status}`);
        throw new Error('Session not found or not active');
    }

    // Update session with new turn info
    session.totalMessages = (session.totalMessages || 0) + 1;
    session.lastActivity = new Date().toISOString();
    
    // Track voices used
    if (voiceUsed && !session.voicesUsed.includes(voiceUsed)) {
        session.voicesUsed.push(voiceUsed);
    }

    // Update session in Cosmos DB
    await sessionsContainer.item(sessionId, userId).replace(session);

    context.res = {
        status: 200,
        headers: corsHeaders,
        body: {
            success: true,
            sessionId: sessionId,
            totalMessages: session.totalMessages,
            message: 'Turn appended successfully'
        }
    };
}

async function endSession(context, req, corsHeaders, userId) {
    const { sessionId } = req.body || {};
    
    if (!sessionId) {
        throw new Error('Missing required field: sessionId');
    }

    context.log(`Ending session: ${sessionId} for userId: ${userId}`);

    // Get session from Cosmos DB
    const { resource: session } = await sessionsContainer.item(sessionId, userId).read();
    context.log(`Result of Cosmos DB read in endSession: ${JSON.stringify(session)}`); // <-- NUEVO LOG

    if (!session) {
        context.log.error(`Session not found for sessionId: ${sessionId} and userId: ${userId}`);
        throw new Error('Session not found');
    }

    context.log(`Found session with studentId: ${session.studentId}`);

    // Calculate duration
    const startTime = new Date(session.startedUtc);
    const endTime = new Date();
    const duration = Math.floor((endTime - startTime) / 1000); // seconds

    // Update session as completed
    session.status = 'uploading';
    session.endedUtc = endTime.toISOString();
    session.duration = duration;

    // Set audio URLs (mixed audio will be created by mix-session function)
    session.audioUrls = {
        mixed: `${userId}/${sessionId}/session_mix.mp3`,
        bot: `${userId}/${sessionId}/session_bot.mp3`
    };
    session.transcriptUrl = `${userId}/${sessionId}/transcript.json`;

    // Update session in Cosmos DB
    await sessionsContainer.item(sessionId, userId).replace(session);

    // Trigger mix-session function to create mixed audio (async - don't wait)
    try {
        await triggerMixSession(sessionId, userId);
        context.log(`Mix session triggered for: ${sessionId}`);
    } catch (error) {
        context.log.error(`Failed to trigger mix session: ${error.message}`);
        // Don't fail the session ending if mix fails
    }

    context.res = {
        status: 200,
        headers: corsHeaders,
        body: {
            success: true,
            sessionId: sessionId,
            duration: duration,
            totalMessages: session.totalMessages,
            message: 'Session ended successfully'
        }
    };
}

async function appendBotAudio(context, req, corsHeaders, userId) {
    try {
        context.log('Appending bot audio for user:', userId);
        
        // Parse form data from Azure Functions request
        const sessionId = req.body.sessionId;
        const botText = req.body.botText;
        const timestamp = req.body.timestamp;
        const audioBlob = req.body.audio; // Should be base64 or buffer
        
        if (!sessionId || !botText || !audioBlob) {
            throw new Error('Missing required fields: sessionId, botText, or audio');
        }
        
        // Convert audio data to buffer
        let fileData;
        if (typeof audioBlob === 'string') {
            // Base64 string
            fileData = Buffer.from(audioBlob, 'base64');
        } else {
            // Already a buffer
            fileData = audioBlob;
        }
        
        context.log(`Bot audio data - Session: ${sessionId}, Text length: ${botText.length}, Audio size: ${fileData.length}`);
        
        // Verify session exists and belongs to user
        const { resource: session } = await sessionsContainer.item(sessionId, userId).read();
        if (!session) {
            throw new Error('Session not found or access denied');
        }
        
        // Create audio file path
        const audioPath = `${userId}/${sessionId}/session_bot.mp3`;
        
        // Upload audio to Azure Blob Storage
        const containerClient = blobServiceClient.getContainerClient(conversationsContainer);
        const blobClient = containerClient.getBlockBlobClient(audioPath);
        
        // Upload the audio file
        await blobClient.upload(fileData, fileData.length, {
            blobHTTPHeaders: {
                blobContentType: 'audio/mpeg'
            }
        });
        
        context.log(`Bot audio uploaded to: ${audioPath}`);
        
        // Update session metadata
        const updatedSession = {
            ...session,
            audioUrls: {
                ...session.audioUrls,
                bot: audioPath
            },
            lastUpdated: new Date().toISOString()
        };
        
        await sessionsContainer.item(sessionId, userId).replace(updatedSession);
        
        context.res = {
            status: 200,
            headers: corsHeaders,
            body: {
                success: true,
                message: 'Bot audio saved successfully',
                audioPath: audioPath
            }
        };
        
    } catch (error) {
        context.log.error('Error appending bot audio:', error);
        
        context.res = {
            status: 500,
            headers: corsHeaders,
            body: {
                success: false,
                error: error.message || 'Failed to save bot audio'
            }
        };
    }
}

async function listSessions(context, req, corsHeaders, userId) {
    context.log(`Listing sessions for user: ${userId}`);

    const querySpec = {
        query: "SELECT * FROM c WHERE c.studentId = @studentId ORDER BY c.startedUtc DESC",
        parameters: [
            { name: "@studentId", value: userId }
        ]
    };

    const { resources: sessions } = await sessionsContainer.items.query(querySpec).fetchAll();

    context.res = {
        status: 200,
        headers: corsHeaders,
        body: {
            success: true,
            sessions: sessions.map(session => ({
                sessionId: session.id,
                date: session.startedUtc,
                duration: session.duration,
                status: session.status,
                totalMessages: session.totalMessages,
                voicesUsed: session.voicesUsed,
                userLevel: session.userLevel
            })),
            total: sessions.length
        }
    };
}

async function downloadSession(context, req, corsHeaders, userId) {
    const sessionId = req.query.sessionId;
    
    if (!sessionId) {
        throw new Error('Missing sessionId parameter');
    }

    context.log(`Downloading session: ${sessionId} for user: ${userId}`);

    // Get session from Cosmos DB
    const { resource: session } = await sessionsContainer.item(sessionId, userId).read();
    
    if (!session) {
        throw new Error('Session not found');
    }

    // Generate download URLs for the files
    const containerClient = blobServiceClient.getContainerClient(conversationsContainer);
    const sasExpiry = new Date();
    sasExpiry.setHours(sasExpiry.getHours() + 1); // 1 hour expiry

    const downloadUrls = {};

    // Generate SAS for mixed audio
    if (session.audioUrls.mixed) {
        downloadUrls.mixedAudio = await generateSASUrl(containerClient, session.audioUrls.mixed, 'r', sasExpiry);
    }

    // Generate SAS for bot audio
    if (session.audioUrls.bot) {
        downloadUrls.botAudio = await generateSASUrl(containerClient, session.audioUrls.bot, 'r', sasExpiry);
    }

    // Generate SAS for transcript
    if (session.transcriptUrl) {
        downloadUrls.transcript = await generateSASUrl(containerClient, session.transcriptUrl, 'r', sasExpiry);
    }

    context.res = {
        status: 200,
        headers: corsHeaders,
        body: {
            success: true,
            sessionId: sessionId,
            session: {
                date: session.startedUtc,
                duration: session.duration,
                totalMessages: session.totalMessages,
                voicesUsed: session.voicesUsed,
                userLevel: session.userLevel
            },
            downloadUrls: downloadUrls,
            expiresAt: sasExpiry.toISOString()
        }
    };
}

// === UTILITY FUNCTIONS ===

async function generateSASUrl(containerClient, blobPath, permissions, expiryTime) {
    const blobClient = containerClient.getBlobClient(blobPath);
    
    const sasOptions = {
        containerName: conversationsContainer,
        blobName: blobPath,
        permissions: permissions, // 'r' for read, 'w' for write
        expiresOn: expiryTime
    };

    try {
        const sasUrl = await blobClient.generateSasUrl(sasOptions);
        return sasUrl;
    } catch (error) {
        throw new Error(`Failed to generate SAS URL: ${error.message}`);
    }
}

async function triggerMixSession(sessionId, userId) {
    const mixSessionUrl = process.env.MIX_SESSION_FUNCTION_URL || 
        `${process.env.AZURE_FUNCTION_BASE_URL || 'https://tutor-aleman-api-v2.azurewebsites.net'}/api/mix-session`;
    
    const response = await fetch(mixSessionUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-functions-key': process.env.AZURE_FUNCTIONS_MASTER_KEY || process.env.MIX_SESSION_FUNCTION_KEY
        },
        body: JSON.stringify({
            sessionId: sessionId,
            userId: userId
        })
    });

    if (!response.ok) {
        throw new Error(`Mix session API call failed: ${response.status} ${response.statusText}`);
    }

    return await response.json();
}