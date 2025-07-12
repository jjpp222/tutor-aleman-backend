const { execFile } = require("child_process");
const { BlobServiceClient } = require("@azure/storage-blob");
const { CosmosClient } = require("@azure/cosmos");
const path = require("path");
const fs = require("fs").promises;

// Configuration
const storageConnectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
const cosmosEndpoint = process.env.COSMOS_DB_ENDPOINT;
const cosmosKey = process.env.COSMOS_DB_KEY;
const conversationsContainer = 'conversations';
const ffmpeg = "ffmpeg";

// Clients
const blobServiceClient = BlobServiceClient.fromConnectionString(storageConnectionString);
const cosmosClient = new CosmosClient({ endpoint: cosmosEndpoint, key: cosmosKey });
const database = cosmosClient.database('TutorAlemanDB');
const sessionsContainer = database.container('Sessions');

// Helper function for retrying
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function waitForBlob(blobClient, retries = 6, delay = 10000) {
    for (let i = 0; i < retries; i++) {
        if (await blobClient.exists()) {
            const props = await blobClient.getProperties();
            if (props.contentLength > 0) {
                return true;
            }
        }
        await sleep(delay);
    }
    return false;
}

module.exports = async function (context, req) {
    const { sessionId, userId } = req.body;
    context.log(`🎯 Mix-session triggered for session: ${sessionId}, user: ${userId}`);

    if (!sessionId || !userId) {
        throw new Error('Missing required fields: sessionId, userId');
    }

    try {
        const prefix = `${userId}/${sessionId}/`;
        const containerClient = blobServiceClient.getContainerClient(conversationsContainer);

        // Get session data from Cosmos DB
        const { resource: sessionData } = await sessionsContainer.item(sessionId, userId).read();
        if (!sessionData) throw new Error(`Session not found: ${sessionId}`);
        
        const userFormat = sessionData.userAudioFormat || 'webm';
        context.log(`🎤 User audio format: ${userFormat}`);

        // Define blob names
        const userBlobName = prefix + `session_user.${userFormat}`;
        const botBlobName = prefix + "session_bot.wav";
        const mixBlobName = prefix + "session_mix.mp3";

        const userBlobClient = containerClient.getBlockBlobClient(userBlobName);
        const botBlobClient = containerClient.getBlockBlobClient(botBlobName);
        const mixBlobClient = containerClient.getBlockBlobClient(mixBlobName);

        if (await mixBlobClient.exists()) {
            context.log(`✅ Mix already exists: ${mixBlobName}`);
            return;
        }

        // Wait for blobs to be ready
        context.log('⏳ Waiting for audio blobs to be available...');
        const isUserBlobReady = await waitForBlob(userBlobClient);
        const isBotBlobReady = await waitForBlob(botBlobClient);

        if (!isUserBlobReady || !isBotBlobReady) {
            throw new Error(`Audio blobs not found or empty after waiting. User: ${isUserBlobReady}, Bot: ${isBotBlobReady}`);
        }
        context.log('✅ Both audio blobs are available and not empty.');

        // Download audio files
        const tmpDir = "/tmp";
        const userPath = path.join(tmpDir, `user_${sessionId}.${userFormat}`);
        const botPath = path.join(tmpDir, `bot_${sessionId}.wav`);

        await userBlobClient.downloadToFile(userPath);
        await botBlobClient.downloadToFile(botPath);
        context.log(`⬇️ Audio files downloaded.`);

        // Bot audio is already in WAV format - no cleaning needed
        const cleanBotPath = botPath;

        // Conditional conversion for Safari MP4 to AAC
        let finalUserPath = userPath;
        if (userFormat === 'mp4') {
            const convertedPath = path.join(tmpDir, `user_${sessionId}_converted.aac`);
            context.log('🔄 Converting Safari MP4 to AAC...');
            await new Promise((resolve, reject) => {
                execFile(ffmpeg, ['-i', userPath, '-vn', '-c:a', 'aac', '-b:a', '128k', '-y', convertedPath], (err) => {
                    if (err) return reject(err);
                    resolve();
                });
            });
            finalUserPath = convertedPath;
            context.log(`✅ Conversion complete.`);
        }

        // FFmpeg mixing command (using cleaned bot audio)
        const mixPath = path.join(tmpDir, `mix_${sessionId}.mp3`);
        const args = ["-hide_banner", "-y", "-i", finalUserPath, "-i", cleanBotPath, "-filter_complex", "[0:a][1:a]amix=inputs=2:normalize=1", "-c:a", "libmp3lame", "-b:a", "128k", mixPath];

        context.log(`🔄 Running FFmpeg...`);
        await new Promise((resolve, reject) => {
            execFile(ffmpeg, args, { timeout: 300000 }, (err) => {
                if (err) return reject(err);
                resolve();
            });
        });
        context.log(`✅ FFmpeg mixing completed.`);

        // Upload the mixed audio
        await mixBlobClient.uploadFile(mixPath, { blobHTTPHeaders: { blobContentType: "audio/mpeg" } });
        context.log(`📤 Mixed audio uploaded: ${mixBlobName}`);

        // Update session metadata
        sessionData.status = 'completed';
        sessionData.audioUrls.mixed = mixBlobName;
        await sessionsContainer.item(sessionId, userId).replace(sessionData);
        context.log(`✅ Session metadata updated.`);

        // Cleanup
        await Promise.all([fs.unlink(userPath), fs.unlink(botPath), fs.unlink(mixPath), finalUserPath !== userPath ? fs.unlink(finalUserPath) : Promise.resolve()].map(p => p.catch(e => context.log.warn(e.message))));
        context.log(`🎉 Mix session completed successfully.`);

    } catch (error) {
        context.log.error(`❌ Mix-session failed: ${error.message}`);
        context.log.error(`Stack trace: ${error.stack}`);
        throw error;
    }
};