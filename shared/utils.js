// Shared utilities for all Azure Functions
const config = require('./config');

// Standard CORS headers
const getCorsHeaders = (origin = '*') => ({
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    'Access-Control-Max-Age': '86400',
    'Content-Type': 'application/json'
});

// Handle CORS preflight requests
const handleCorsPrelight = (context) => {
    context.res = {
        status: 200,
        headers: getCorsHeaders()
    };
    return;
};

// Standard error response
const createErrorResponse = (status, message, details = null) => ({
    status,
    headers: getCorsHeaders(),
    body: {
        success: false,
        error: message,
        details,
        timestamp: new Date().toISOString()
    }
});

// Standard success response
const createSuccessResponse = (data, status = 200) => ({
    status,
    headers: getCorsHeaders(),
    body: {
        success: true,
        ...data,
        timestamp: new Date().toISOString()
    }
});

// Input validation helper
const validateInput = (input, requiredFields) => {
    const errors = [];
    
    for (const field of requiredFields) {
        if (!input[field] || (typeof input[field] === 'string' && input[field].trim().length === 0)) {
            errors.push(`${field} is required`);
        }
    }
    
    return errors;
};

// Text sanitization for speech synthesis
const sanitizeTextForSpeech = (text) => {
    if (!text) return '';
    
    return text
        // Remove emojis
        .replace(/[😊😄😃🙂😌🤔👍💪🎉🚀✨💯🔥⭐🌟❤️💙💚💛🧡💜🤝👏🙌🤗😍😘😗😙😚🥰😇🙃😉😋😎🤓🧐🤨🤪😜😝😛🤑🤗🤭🤫🤐🤔😴😪😵🤯🥳🥺😢😭😤😠😡🤬😱😨😰😥😓🤤🤢🤮🤧🥵🥶😶😐😑😬🙄😯😦😧😮😲🥱😴🤤🌚🌝]/g, '')
        .replace(/[\u{1F600}-\u{1F64F}]/gu, '')
        .replace(/[\u{1F300}-\u{1F5FF}]/gu, '')
        .replace(/[\u{1F680}-\u{1F6FF}]/gu, '')
        .replace(/[\u{1F1E0}-\u{1F1FF}]/gu, '')
        .replace(/[\u{2600}-\u{26FF}]/gu, '')
        .replace(/[\u{2700}-\u{27BF}]/gu, '')
        // Remove excessive whitespace
        .replace(/\s+/g, ' ')
        .trim();
};

// Logging helper with context
const logWithContext = (context, level, message, data = null) => {
    const logMessage = `[${new Date().toISOString()}] ${message}`;
    
    switch (level) {
        case 'error':
            context.log.error(logMessage, data);
            break;
        case 'warn':
            context.log.warn(logMessage, data);
            break;
        case 'info':
        default:
            context.log(logMessage, data);
            break;
    }
};

const parseRequestBody = (req) => {
    // Azure Functions v4 fix: try direct access first
    if (req.body && typeof req.body === 'object') {
        return req.body;
    }
    
    // For Azure Functions v4, body is often a string that needs parsing
    if (req.body && typeof req.body === 'string') {
        try {
            return JSON.parse(req.body);
        } catch (parseError) {
            console.log('Error parsing req.body string:', parseError.message);
        }
    }
    
    // Simple fix: return empty object if nothing works
    console.log('parseRequestBody: Unable to parse, returning empty object');
    console.log('Available req properties:', Object.keys(req));
    console.log('req.body type:', typeof req.body);
    console.log('req.body value:', req.body);
    return {};
};

module.exports = {
    getCorsHeaders,
    handleCorsPrelight,
    createErrorResponse,
    createSuccessResponse,
    validateInput,
    sanitizeTextForSpeech,
    logWithContext,
    parseRequestBody,
    config
};