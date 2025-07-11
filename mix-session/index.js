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

// FFmpeg binary path (will be in bin/ folder)
const ffmpeg = path.join(__dirname, "bin", "ffmpeg");

// Cosmos DB client
const cosmosClient = new CosmosClient({ endpoint: cosmosEndpoint, key: cosmosKey });
const database = cosmosClient.database('TutorAlemanDB');
const sessionsContainer = database.container('Sessions');

module.exports = async function (context, myBlob) {
    const blobName = context.bindingData.name;
    context.log(`🎯 Mix-session triggered for: ${blobName}`);

    // Only process transcript.json files
    if (!blobName.endsWith("transcript.json")) {
        context.log(`⏭️  Skipping non-transcript file: ${blobName}`);
        return;
    }

    try {
        // Extract path components
        const pathParts = blobName.split('/');
        if (pathParts.length < 3) {
            context.log(`❌ Invalid blob path structure: ${blobName}`);
            return;
        }

        const userId = pathParts[0];
        const sessionId = pathParts[1];
        const prefix = `${userId}/${sessionId}/`;

        context.log(`👤 Processing session: ${sessionId} for user: ${userId}`);

        // Check if mix already exists (idempotency)
        const mixBlobName = prefix + "session_mix.mp3";
        const blobServiceClient = BlobServiceClient.fromConnectionString(storageConnectionString);
        const containerClient = blobServiceClient.getContainerClient(conversationsContainer);
        const mixBlobClient = containerClient.getBlockBlobClient(mixBlobName);
        
        if (await mixBlobClient.exists()) {
            context.log(`✅ Mix already exists: ${mixBlobName}`);
            return;
        }

        // Download transcript
        const tmpDir = "/tmp";
        const transcriptPath = path.join(tmpDir, `transcript_${sessionId}.json`);
        const transcriptBlobClient = containerClient.getBlockBlobClient(blobName);
        await transcriptBlobClient.downloadToFile(transcriptPath);
        
        const transcript = JSON.parse(await fs.readFile(transcriptPath, 'utf8'));
        context.log(`📋 Transcript loaded - Schema version: ${transcript.schemaVersion || 1}`);

        // Define audio file paths
        const userBlobName = prefix + "session_user.wav";
        const botBlobName = prefix + "session_bot.mp3";

        // Check if both audio files exist
        const userBlobClient = containerClient.getBlockBlobClient(userBlobName);
        const botBlobClient = containerClient.getBlockBlobClient(botBlobName);
        
        const userExists = await userBlobClient.exists();
        const botExists = await botBlobClient.exists();

        if (!userExists || !botExists) {
            context.log(`⚠️  Audio files incomplete - User: ${userExists}, Bot: ${botExists}`);
            context.log(`🔄 Will retry when both audio files are available`);
            return;
        }

        context.log(`📁 Both audio files found, starting mix process`);

        // Extract first bot offset from transcript
        const botOffset = transcript.conversation?.find(t => t.role === "assistant")?.relativeMs || 0;
        context.log(`🕒 Bot offset: ${botOffset}ms`);

        // Download both audio files to temporary directory
        const userPath = path.join(tmpDir, `user_${sessionId}.wav`);
        const botPath = path.join(tmpDir, `bot_${sessionId}.mp3`);
        
        await userBlobClient.downloadToFile(userPath);
        await botBlobClient.downloadToFile(botPath);
        
        context.log(`⬇️  Audio files downloaded to temp directory`);

        // Check if FFmpeg binary exists
        try {
            await fs.access(ffmpeg);
        } catch (error) {
            context.log(`❌ FFmpeg binary not found at: ${ffmpeg}`);
            throw new Error(`FFmpeg binary not found: ${error.message}`);
        }

        // Execute FFmpeg mixing
        const mixPath = path.join(tmpDir, `mix_${sessionId}.mp3`);
        const args = [
            "-hide_banner", "-y",
            "-i", userPath,
            "-i", botPath,
            "-filter_complex",
            `[0:a]adelay=0|0[user];[1:a]adelay=${botOffset}|${botOffset}[bot];` +
            "[user][bot]amix=inputs=2:normalize=1:duration=longest, dynaudnorm",
            "-c:a", "libmp3lame", "-b:a", "128k", 
            mixPath
        ];

        context.log(`🔄 Running FFmpeg with args: ${args.join(' ')}`);

        await new Promise((resolve, reject) => {
            execFile(ffmpeg, args, { timeout: 300000 }, (error, stdout, stderr) => {
                if (error) {
                    context.log(`❌ FFmpeg error: ${error.message}`);
                    context.log(`❌ FFmpeg stderr: ${stderr}`);
                    reject(new Error(`FFmpeg failed: ${error.message}`));
                } else {
                    context.log(`✅ FFmpeg completed successfully`);
                    context.log(`📊 FFmpeg output: ${stdout}`);
                    resolve();
                }
            });
        });

        // Upload the mixed audio to blob storage
        await mixBlobClient.uploadFile(mixPath, {
            blobHTTPHeaders: { 
                blobContentType: "audio/mpeg",
                blobCacheControl: "public, max-age=31536000"
            }
        });

        context.log(`📤 Mixed audio uploaded: ${mixBlobName}`);

        // Update session metadata in Cosmos DB
        try {
            const { resource: session } = await sessionsContainer.item(sessionId, userId).read();
            if (session) {
                const updatedSession = {
                    ...session,
                    mixReady: true,
                    mixUrl: mixBlobName,
                    mixCreatedAt: new Date().toISOString(),
                    lastUpdated: new Date().toISOString()
                };
                
                await sessionsContainer.item(sessionId, userId).replace(updatedSession);
                context.log(`✅ Session metadata updated with mixReady: true`);
            }
        } catch (cosmosError) {
            context.log(`⚠️  Could not update Cosmos DB: ${cosmosError.message}`);
            // Don't fail the function - the mix file is still created
        }

        // Cleanup temporary files
        await Promise.all([
            fs.unlink(transcriptPath).catch(() => {}),
            fs.unlink(userPath).catch(() => {}),
            fs.unlink(botPath).catch(() => {}),
            fs.unlink(mixPath).catch(() => {})
        ]);

        context.log(`🎉 Mix session completed successfully for: ${sessionId}`);
        context.log(`📁 Output: ${mixBlobName}`);

    } catch (error) {
        context.log(`❌ Mix-session failed: ${error.message}`);
        context.log(`❌ Stack trace: ${error.stack}`);
        throw error;
    }
};