const { validateJWT } = require('../shared/auth');
const { BlobServiceClient } = require('@azure/storage-blob');
const { CosmosClient } = require('@azure/cosmos');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs').promises;
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
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-ms-version, x-ms-date',
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
                } else if (segments.includes('append-user-audio')) {
                    await appendUserAudio(context, req, corsHeaders, userId);
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
    
    const sessionId = `sess_${Date.now()}_${userId}_${uuidv4().substring(0, 8)}`;
    const startTime = new Date().toISOString();

    const containerClient = blobServiceClient.getContainerClient(conversationsContainer);
    await containerClient.createIfNotExists();

    // Detect audio type by User-Agent (approximation)
    const userAgent = req.headers['user-agent'] || '';
    const isSafari = userAgent.includes('Safari') && !userAgent.includes('Chrome');
    const audioExtension = isSafari ? 'mp4' : 'webm';
    const audioMimeType = isSafari ? 'audio/mp4' : 'audio/webm';

    // Create AppendBlobs
    const userAudioPath = `${userId}/${sessionId}/session_user.${audioExtension}`;
    const botAudioPath = `${userId}/${sessionId}/session_bot.mp3`;

    const userBlobClient = containerClient.getAppendBlobClient(userAudioPath);
    const botBlobClient = containerClient.getAppendBlobClient(botAudioPath);

    // Create blobs only if they do not exist
    await userBlobClient.createIfNotExists({
        blobHTTPHeaders: { blobContentType: audioMimeType }
    });

    await botBlobClient.createIfNotExists({
        blobHTTPHeaders: { blobContentType: 'audio/mpeg' }
    });

    context.log(`Created AppendBlobs - User: ${audioExtension}, Bot: mp3`);

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
            user: userAudioPath, // Store path from the start
            bot: botAudioPath
        },
        userAudioFormat: audioExtension, // Store format for mix-session
        transcriptUrl: `${userId}/${sessionId}/transcript.json`,
        createdAt: startTime
    };

    await sessionsContainer.items.create(sessionDoc, { partitionKey: userId });
    context.log(`Session document created: ${sessionId}`);

    // Generate SAS URLs for uploads
    const sasExpiry = new Date();
    sasExpiry.setHours(sasExpiry.getHours() + 2); // 2 hours expiry

    const userAudioSAS = await generateSASUrl(containerClient, userAudioPath, 'acw', sasExpiry); // Append, Create, Write
    const botAudioSAS = await generateSASUrl(containerClient, botAudioPath, 'acw', sasExpiry);
    const transcriptSAS = await generateSASUrl(containerClient, sessionDoc.transcriptUrl, 'w', sasExpiry);

    context.res = {
        status: 200,
        headers: corsHeaders,
        body: {
            success: true,
            sessionId: sessionId,
            uploadUrls: {
                userAudio: userAudioSAS,
                botAudio: botAudioSAS,
                transcript: transcriptSAS
            },
            audioFormat: audioExtension,
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

    // Get session from Cosmos DB with retry for consistency
    context.log(`Attempting to read session: ${sessionId} with userId: ${userId}`);
    let session = null;
    let attempts = 0;
    const maxAttempts = 3;
    
    while (attempts < maxAttempts && !session) {
        attempts++;
        try {
            const { resource: result } = await sessionsContainer.item(sessionId, sessionId).read();
            session = result;
            if (session) {
                context.log(`Session found on attempt ${attempts}:`, { id: session.id, status: session.status });
                break;
            }
        } catch (error) {
            context.log(`Session read attempt ${attempts} failed:`, error.message);
        }
        
        if (attempts < maxAttempts) {
            context.log(`Session not found, retrying in 1 second... (attempt ${attempts}/${maxAttempts})`);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
    
    if (!session || session.status !== 'active') {
        context.log.error(`Session validation failed after ${attempts} attempts - Session exists: ${!!session}, Status: ${session?.status}`);
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
    await sessionsContainer.item(sessionId, sessionId).replace(session);

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
    const { resource: session } = await sessionsContainer.item(sessionId, sessionId).read();

    if (!session) {
        context.log.error(`Session not found for sessionId: ${sessionId} and userId: ${userId}`);
        throw new Error('Session not found');
    }

    // Calculate duration
    const startTime = new Date(session.startedUtc);
    const endTime = new Date();
    const duration = Math.floor((endTime - startTime) / 1000); // seconds

    // Update session as completed
    session.status = 'completed'; // Mark as completed
    session.endedUtc = endTime.toISOString();
    session.duration = duration;

    // Verify final audio files existence
    const containerClient = blobServiceClient.getContainerClient(conversationsContainer);
    let userAudioPath = null;
    
    // The user audio format is already stored in the session document
    const userAudioFormat = session.userAudioFormat || 'webm';
    const potentialUserAudioPath = `${userId}/${sessionId}/session_user.${userAudioFormat}`;
    
    if (await containerClient.getAppendBlobClient(potentialUserAudioPath).exists()) {
        userAudioPath = potentialUserAudioPath;
    }

    const botAudioPath = `${userId}/${sessionId}/session_bot.mp3`;
    const botBlobExists = await containerClient.getAppendBlobClient(botAudioPath).exists();

    context.log(`Audio files check - User: ${userAudioPath || 'none'}, Bot: ${botBlobExists}`);

    // Update audio URLs in session document
    session.audioUrls = {
        user: userAudioPath,
        bot: botBlobExists ? botAudioPath : null,
        mixed: `${userId}/${sessionId}/session_mix.mp3`
    };

    // Update session in Cosmos DB
    await sessionsContainer.item(sessionId, sessionId).replace(session);

    // Trigger mix-session function (fire and forget)
    try {
        await triggerMixSession(sessionId, userId);
        context.log(`Mix session triggered for: ${sessionId}`);
    } catch (error) {
        context.log.error(`Failed to trigger mix session: ${error.message}`);
        // Do not fail the session ending if mix trigger fails
    }

    context.res = {
        status: 200,
        headers: corsHeaders,
        body: {
            success: true,
            sessionId: sessionId,
            duration: duration,
            totalMessages: session.totalMessages,
            message: 'Session ended successfully and mix process initiated'
        }
    };
}

async function appendBotAudio(context, req, corsHeaders, userId) {
    try {
        const { sessionId, botText, audio } = req.body;

        if (!sessionId || !audio) {
            throw new Error('Missing required fields: sessionId, audio');
        }

        // Convert audio to buffer
        const fileData = Buffer.from(audio, 'base64');

        context.log(`Bot audio - Session: ${sessionId}, Size: ${fileData.length} bytes`);

        // Verify block size limit (4MB)
        if (fileData.length > 4 * 1024 * 1024) {
            throw new Error('Audio chunk too large for AppendBlob (>4MB)');
        }

        // Append to existing blob
        const audioPath = `${userId}/${sessionId}/session_bot.mp3`;
        const containerClient = blobServiceClient.getContainerClient(conversationsContainer);
        const appendBlobClient = containerClient.getAppendBlobClient(audioPath);

        await appendBlobClient.appendBlock(fileData, fileData.length);

        context.log(`✅ Bot audio appended: ${fileData.length} bytes to ${audioPath}`);

        // Update session last activity timestamp
        const { resource: session } = await sessionsContainer.item(sessionId, sessionId).read();
        session.lastActivity = new Date().toISOString();
        await sessionsContainer.item(sessionId, sessionId).replace(session);

        context.res = {
            status: 200,
            headers: corsHeaders,
            body: {
                success: true,
                message: 'Bot audio appended successfully',
                bytesAppended: fileData.length
            }
        };

    } catch (error) {
        context.log.error('❌ Error appending bot audio:', error);
        context.res = {
            status: 500,
            headers: corsHeaders,
            body: { success: false, error: error.message }
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
    const { resource: session } = await sessionsContainer.item(sessionId, sessionId).read();
    
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
        `${process.env.AZURE_FUNCTION_BASE_URL || 'https://tutor-aleman-backend-v4.azurewebsites.net'}/api/mix-session`;
    
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

