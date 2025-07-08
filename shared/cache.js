const NodeCache = require('node-cache');

// Create cache instance with optimized settings for user profiles
const userProfileCache = new NodeCache({
    stdTTL: 3600, // 1 hour TTL for user profiles
    checkperiod: 120, // Check for expired keys every 2 minutes
    useClones: false, // Don't clone objects for better performance
    maxKeys: 1000, // Limit cache size to 1000 user profiles
    deleteOnExpire: true,
    enableLegacyCallbacks: false
});

// Create cache instance for TTS audio (shorter TTL)
const ttsCache = new NodeCache({
    stdTTL: 300, // 5 minutes TTL for TTS audio
    checkperiod: 60, // Check for expired keys every minute
    useClones: false,
    maxKeys: 500, // Limit cache size to 500 audio files
    deleteOnExpire: true,
    enableLegacyCallbacks: false
});

class CacheService {
    // User profile caching
    static getUserProfile(userId) {
        try {
            const cacheKey = `user:${userId}`;
            const cachedProfile = userProfileCache.get(cacheKey);
            return cachedProfile || null;
        } catch (error) {
            console.error('Cache get error:', error);
            return null;
        }
    }

    static setUserProfile(userId, profile) {
        try {
            const cacheKey = `user:${userId}`;
            userProfileCache.set(cacheKey, profile);
            return true;
        } catch (error) {
            console.error('Cache set error:', error);
            return false;
        }
    }

    static invalidateUserProfile(userId) {
        try {
            const cacheKey = `user:${userId}`;
            userProfileCache.del(cacheKey);
            return true;
        } catch (error) {
            console.error('Cache invalidate error:', error);
            return false;
        }
    }

    // TTS audio caching
    static getTTSAudio(textHash, voice, cefrLevel) {
        try {
            const cacheKey = `tts:${textHash}:${voice}:${cefrLevel}`;
            const cachedAudio = ttsCache.get(cacheKey);
            return cachedAudio || null;
        } catch (error) {
            console.error('TTS cache get error:', error);
            return null;
        }
    }

    static setTTSAudio(textHash, voice, cefrLevel, audioData) {
        try {
            const cacheKey = `tts:${textHash}:${voice}:${cefrLevel}`;
            ttsCache.set(cacheKey, audioData);
            return true;
        } catch (error) {
            console.error('TTS cache set error:', error);
            return false;
        }
    }

    // Utility methods
    static getUserProfileStats() {
        return {
            keys: userProfileCache.keys().length,
            hits: userProfileCache.getStats().hits,
            misses: userProfileCache.getStats().misses,
            hitRate: (userProfileCache.getStats().hits / (userProfileCache.getStats().hits + userProfileCache.getStats().misses) * 100).toFixed(2) + '%'
        };
    }

    static getTTSCacheStats() {
        return {
            keys: ttsCache.keys().length,
            hits: ttsCache.getStats().hits,
            misses: ttsCache.getStats().misses,
            hitRate: (ttsCache.getStats().hits / (ttsCache.getStats().hits + ttsCache.getStats().misses) * 100).toFixed(2) + '%'
        };
    }

    static clearAll() {
        try {
            userProfileCache.flushAll();
            ttsCache.flushAll();
            return true;
        } catch (error) {
            console.error('Cache clear error:', error);
            return false;
        }
    }

    // Hash function for TTS text
    static hashText(text) {
        let hash = 0;
        if (text.length === 0) return hash;
        for (let i = 0; i < text.length; i++) {
            const char = text.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash).toString(16);
    }
}

module.exports = { CacheService };