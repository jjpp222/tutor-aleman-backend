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

// FFmpeg binary path (assuming it's available in the Azure Function environment)
const ffmpeg = "ffmpeg";

// Cosmos DB client
const cosmosClient = new CosmosClient({ endpoint: cosmosEndpoint, key: cosmosKey });
const database = cosmosClient.database('TutorAlemanDB');
const sessionsContainer = database.container('Sessions');

module.exports = async function (context, req) {
    const { sessionId, userId } = req.body;
    context.log(`🎯 Mix-session triggered for session: ${sessionId}, user: ${userId}`);

    if (!sessionId || !userId) {
        throw new Error('Missing required fields: sessionId, userId');
    }

    try {
        const prefix = `${userId}/${sessionId}/`;

        // Get session data from Cosmos DB to find audio format
        const { resource: sessionData } = await sessionsContainer.item(sessionId, userId).read();
        if (!sessionData) {
            throw new Error(`Session not found: ${sessionId}`);
        }
        const userFormat = sessionData.userAudioFormat || 'webm'; // Default to webm if not specified

        context.log(`🎤 User audio format: ${userFormat}`);

        // Define blob names
        const userBlobName = prefix + `session_user.${userFormat}`;
        const botBlobName = prefix + "session_bot.mp3";
        const mixBlobName = prefix + "session_mix.mp3";

        const blobServiceClient = BlobServiceClient.fromConnectionString(storageConnectionString);
        const containerClient = blobServiceClient.getContainerClient(conversationsContainer);
        
        // Check if mix already exists
        const mixBlobClient = containerClient.getBlockBlobClient(mixBlobName);
        if (await mixBlobClient.exists()) {
            context.log(`✅ Mix already exists: ${mixBlobName}`);
            return;
        }

        // Download audio files
        const tmpDir = "/tmp";
        const userPath = path.join(tmpDir, `user_${sessionId}.${userFormat}`);
        const botPath = path.join(tmpDir, `bot_${sessionId}.mp3`);

        const userBlobClient = containerClient.getBlockBlobClient(userBlobName);
        const botBlobClient = containerClient.getBlockBlobClient(botBlobName);

        await userBlobClient.downloadToFile(userPath);
        await botBlobClient.downloadToFile(botPath);
        context.log(`⬇️ Audio files downloaded to temp directory`);

        // Conditional conversion for Safari MP4 to AAC
        let finalUserPath = userPath;
        if (userFormat === 'mp4') {
            const convertedPath = path.join(tmpDir, `user_${sessionId}_converted.aac`);
            context.log('🔄 Converting Safari MP4 to AAC for compatibility...');
            
            await new Promise((resolve, reject) => {
                execFile(ffmpeg, [
                    '-i', userPath,
                    '-vn',                // No video
                    '-c:a', 'aac',       // AAC codec
                    '-b:a', '128k',      // Bitrate
                    '-y',                // Overwrite
                    convertedPath
                ], (error, stdout, stderr) => {
                    if (error) {
                        context.log.error(`FFmpeg conversion error: ${stderr}`);
                        return reject(error);
                    }
                    context.log(`✅ Converted Safari MP4 to AAC: ${convertedPath}`);
                    resolve();
                });
            });
            finalUserPath = convertedPath;
        }

        // FFmpeg mixing command
        const mixPath = path.join(tmpDir, `mix_${sessionId}.mp3`);
        const args = [
            "-hide_banner", "-y",
            "-i", finalUserPath, // Use converted path if available
            "-i", botPath,
            "-filter_complex", "[0:a][1:a]amix=inputs=2:normalize=1",
            "-c:a", "libmp3lame", "-b:a", "128k",
            mixPath
        ];

        context.log(`🔄 Running FFmpeg with args: ${args.join(' ')}`);
        await new Promise((resolve, reject) => {
            execFile(ffmpeg, args, { timeout: 300000 }, (error, stdout, stderr) => {
                if (error) {
                    context.log.error(`FFmpeg mix error: ${stderr}`);
                    return reject(error);
                }
                context.log(`✅ FFmpeg mixing completed`);
                resolve();
            });
        });

        // Upload the mixed audio
        await mixBlobClient.uploadFile(mixPath, {
            blobHTTPHeaders: { blobContentType: "audio/mpeg" }
        });
        context.log(`📤 Mixed audio uploaded: ${mixBlobName}`);

        // Update session metadata in Cosmos DB
        sessionData.status = 'completed';
        sessionData.audioUrls.mixed = mixBlobName;
        await sessionsContainer.item(sessionId, userId).replace(sessionData);
        context.log(`✅ Session metadata updated with mix URL`);

        // Cleanup temporary files
        await Promise.all([
            fs.unlink(userPath).catch(() => {}),
            fs.unlink(botPath).catch(() => {}),
            fs.unlink(mixPath).catch(() => {}),
            finalUserPath !== userPath ? fs.unlink(finalUserPath).catch(() => {}) : Promise.resolve()
        ]);

        context.log(`🎉 Mix session completed successfully for: ${sessionId}`);

    } catch (error) {
        context.log.error(`❌ Mix-session failed: ${error.message}`);
        context.log.error(`Stack trace: ${error.stack}`);
        throw error;
    }
};