const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { Redis } = require('@upstash/redis');

const app = express();
app.use(express.json());
app.disable('x-powered-by');
app.use(
    helmet({
        contentSecurityPolicy: false
    })
);

const activateLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false
});

const adminLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false
});

app.use('/activate', activateLimiter);
app.use('/admin', adminLimiter);

// Storage config: Upstash Redis (preferred on free hosting) or local file fallback
const DB_FILE = (process.env.LICENSE_DB_FILE || path.join(__dirname, 'licenses.json')).trim();
const AUDIT_FILE = (process.env.AUDIT_LOG_FILE || path.join(__dirname, 'audit.log')).trim();
const REDIS_URL = (process.env.UPSTASH_REDIS_REST_URL || '').trim();
const REDIS_TOKEN = (process.env.UPSTASH_REDIS_REST_TOKEN || '').trim();
const REDIS_KEY = (process.env.LICENSES_REDIS_KEY || 'customfog:licenses').trim();
const CHALLENGE_TTL_MS = 60 * 1000;
const SESSION_TTL_MS = 10 * 60 * 1000;
const challenges = new Map();
const sessions = new Map();
const redis = REDIS_URL && REDIS_TOKEN ? new Redis({ url: REDIS_URL, token: REDIS_TOKEN }) : null;

let licenses = {};
let storageMode = redis ? 'upstash' : 'file';

// Generate license key
function generateLicenseKey() {
    return crypto.randomBytes(16).toString('hex').toUpperCase();
}

function sha256(input) {
    return crypto.createHash('sha256').update(input).digest('hex');
}

function hashForLogs(value) {
    if (!value) return 'none';
    return sha256(String(value)).slice(0, 16);
}

function getClientIp(req) {
    const xff = req.headers['x-forwarded-for'];
    if (typeof xff === 'string' && xff.length > 0) {
        return xff.split(',')[0].trim();
    }
    return req.ip || req.socket?.remoteAddress || 'unknown';
}

function audit(event, req, extra = {}) {
    const line = JSON.stringify({
        ts: new Date().toISOString(),
        event,
        ip: getClientIp(req),
        uaHash: hashForLogs(req.headers['user-agent'] || ''),
        ...extra
    });
    try {
        fs.mkdirSync(path.dirname(AUDIT_FILE), { recursive: true });
        fs.appendFileSync(AUDIT_FILE, line + '\n');
    } catch (error) {
        console.error('Audit log write error:', error.message);
    }
}

function getAdminSecret() {
    const secret = process.env.ADMIN_PASSWORD;
    return typeof secret === 'string' ? secret.trim() : '';
}

function cleanupExpiredState() {
    const now = Date.now();
    for (const [nonce, item] of challenges.entries()) {
        if (!item || item.expiresAt <= now) {
            challenges.delete(nonce);
        }
    }
    for (const [token, item] of sessions.entries()) {
        if (!item || item.expiresAt <= now) {
            sessions.delete(token);
        }
    }
}

function issueSession(key, deviceHash) {
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + SESSION_TTL_MS;
    sessions.set(sessionToken, { key, deviceHash, expiresAt });
    return { sessionToken, sessionExpiresAt: expiresAt };
}

function verifyClientProof(nonce, key, deviceHash, proof) {
    const expected = sha256(`${nonce}:${key}:${deviceHash}`);
    return typeof proof === 'string' && proof === expected;
}

function verifyEnrollProof(nonce, enrollToken, deviceHash, proof) {
    const expected = sha256(`${nonce}:${enrollToken}:${deviceHash}`);
    return typeof proof === 'string' && proof === expected;
}

function licenseExpired(license) {
    if (!license || license.licenseExpiresAt == null) {
        return false;
    }
    const t = Number(license.licenseExpiresAt);
    if (!Number.isFinite(t) || t <= 0) {
        return false;
    }
    return Date.now() > t;
}

function licenseExpiryPayload(license) {
    if (!license || license.licenseExpiresAt == null) {
        return {};
    }
    const t = Number(license.licenseExpiresAt);
    if (!Number.isFinite(t) || t <= 0) {
        return {};
    }
    return { license_expires_at: t };
}

function requireAdmin(req, res, next) {
    const expected = getAdminSecret();
    if (!expected) {
        return res.status(503).json({ error: 'Admin auth is not configured' });
    }

    const provided = (req.headers['x-admin-token'] || '').toString().trim();
    if (!provided || provided !== expected) {
        audit('admin_auth_failed', req);
        return res.status(403).json({ error: 'Forbidden' });
    }

    next();
}

async function loadLicenses() {
    if (redis) {
        try {
            const data = await redis.get(REDIS_KEY);
            if (data && typeof data === 'object') {
                licenses = data;
            } else if (typeof data === 'string' && data.trim().length > 0) {
                licenses = JSON.parse(data);
            } else {
                licenses = {};
            }
            console.log('Loaded licenses from Upstash:', Object.keys(licenses).length, 'keys');
            return;
        } catch (error) {
            console.error('Error loading licenses from Upstash, fallback to file:', error.message);
            storageMode = 'file-fallback';
        }
    }

    try {
        if (fs.existsSync(DB_FILE)) {
            const data = fs.readFileSync(DB_FILE, 'utf8');
            licenses = JSON.parse(data);
            console.log('Loaded licenses from file:', Object.keys(licenses).length, 'keys');
        } else {
            console.log('No licenses file found, starting empty');
            licenses = {};
        }
    } catch (error) {
        console.error('Error loading licenses from file:', error.message);
        licenses = {};
    }
}

async function saveLicenses() {
    try {
        if (redis && storageMode === 'upstash') {
            await redis.set(REDIS_KEY, licenses);
            return;
        }
        fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
        fs.writeFileSync(DB_FILE, JSON.stringify(licenses, null, 2));
    } catch (error) {
        console.error('Save licenses error:', error.message);
    }
}

// Activation endpoint
app.post('/activate', (req, res) => {
    audit('legacy_activate_blocked', req);
    res.status(410).json({
        ok: false,
        error: 'Legacy /activate is disabled. Use /auth/bind flow'
    });
});

app.post('/auth/challenge', (req, res) => {
    cleanupExpiredState();
    const nonce = crypto.randomBytes(24).toString('hex');
    const expiresAt = Date.now() + CHALLENGE_TTL_MS;
    challenges.set(nonce, { expiresAt });
    res.json({ ok: true, nonce, expires_at: expiresAt });
});

app.post('/auth/bind', async (req, res) => {
    cleanupExpiredState();
    const { mod, key, device_hash: deviceHash, nonce, proof } = req.body || {};

    if (mod !== 'customfog') {
        return res.json({ ok: false, error: 'Unknown mod' });
    }
    const normalizedKey = typeof key === 'string' ? key.trim().toUpperCase() : '';
    if (!normalizedKey) {
        return res.json({ ok: false, error: 'Invalid key' });
    }
    if (!deviceHash || typeof deviceHash !== 'string' || deviceHash.length < 16) {
        return res.json({ ok: false, error: 'Invalid device hash' });
    }
    if (!nonce || !challenges.has(nonce)) {
        return res.json({ ok: false, error: 'Invalid challenge' });
    }
    const challenge = challenges.get(nonce);
    challenges.delete(nonce);
    if (!challenge || challenge.expiresAt <= Date.now()) {
        return res.json({ ok: false, error: 'Challenge expired' });
    }
    if (!verifyClientProof(nonce, normalizedKey, deviceHash, proof)) {
        audit('bind_bad_proof', req, { keyHash: hashForLogs(normalizedKey) });
        return res.json({ ok: false, error: 'Bad proof' });
    }

    const license = licenses[normalizedKey];
    if (!license) {
        audit('bind_invalid_key', req, { keyHash: hashForLogs(normalizedKey) });
        return res.json({ ok: false, error: 'Invalid key' });
    }
    if (license.banned) {
        return res.json({ ok: false, error: 'Key banned' });
    }
    if (licenseExpired(license)) {
        audit('bind_license_expired', req, { keyHash: hashForLogs(normalizedKey) });
        return res.json({ ok: false, error: 'License expired' });
    }
    if (license.boundDeviceHash && license.boundDeviceHash !== deviceHash) {
        audit('bind_device_mismatch', req, { keyHash: hashForLogs(normalizedKey) });
        return res.json({ ok: false, error: 'Key is bound to another device' });
    }
    if (!license.boundDeviceHash) {
        if (license.usedAt || license.activations <= 0) {
            return res.json({ ok: false, error: 'Key already used' });
        }
        license.boundDeviceHash = deviceHash;
        license.usedAt = new Date().toISOString();
        license.activations = 0;
        license.activationToken = crypto.randomBytes(32).toString('hex');
    }

    const session = issueSession(normalizedKey, deviceHash);
    await saveLicenses();
    audit('bind_success', req, { keyHash: hashForLogs(normalizedKey) });
    res.json({
        ok: true,
        activation_token: license.activationToken,
        session_token: session.sessionToken,
        session_expires_at: session.sessionExpiresAt,
        ...licenseExpiryPayload(license)
    });
});

app.post('/auth/enroll', async (req, res) => {
    cleanupExpiredState();
    const { mod, enroll_token: enrollToken, device_hash: deviceHash, nonce, proof } = req.body || {};
    if (mod !== 'customfog') {
        return res.json({ ok: false, error: 'Unknown mod' });
    }
    if (!enrollToken || typeof enrollToken !== 'string') {
        return res.json({ ok: false, error: 'Invalid enroll token' });
    }
    if (!deviceHash || typeof deviceHash !== 'string' || deviceHash.length < 16) {
        return res.json({ ok: false, error: 'Invalid device hash' });
    }
    if (!nonce || !challenges.has(nonce)) {
        return res.json({ ok: false, error: 'Invalid challenge' });
    }
    const challenge = challenges.get(nonce);
    challenges.delete(nonce);
    if (!challenge || challenge.expiresAt <= Date.now()) {
        return res.json({ ok: false, error: 'Challenge expired' });
    }
    if (!verifyEnrollProof(nonce, enrollToken, deviceHash, proof)) {
        audit('enroll_bad_proof', req, { enrollHash: hashForLogs(enrollToken) });
        return res.json({ ok: false, error: 'Bad proof' });
    }

    let matchedKey = null;
    let license = null;
    for (const key of Object.keys(licenses)) {
        const cand = licenses[key];
        if (cand && cand.enrollToken === enrollToken) {
            matchedKey = key;
            license = cand;
            break;
        }
    }
    if (!license || !matchedKey) {
        audit('enroll_invalid_token', req, { enrollHash: hashForLogs(enrollToken) });
        return res.json({ ok: false, error: 'Invalid enroll token' });
    }
    if (license.banned) {
        return res.json({ ok: false, error: 'Key banned' });
    }
    if (licenseExpired(license)) {
        audit('enroll_license_expired', req, { keyHash: hashForLogs(matchedKey) });
        return res.json({ ok: false, error: 'License expired' });
    }
    if (license.boundDeviceHash && license.boundDeviceHash !== deviceHash) {
        audit('enroll_device_mismatch', req, { keyHash: hashForLogs(matchedKey) });
        return res.json({ ok: false, error: 'Device mismatch' });
    }
    if (!license.boundDeviceHash) {
        license.boundDeviceHash = deviceHash;
        license.usedAt = new Date().toISOString();
        license.activations = 0;
        if (!license.activationToken) {
            license.activationToken = crypto.randomBytes(32).toString('hex');
        }
    }
    const session = issueSession(matchedKey, deviceHash);
    await saveLicenses();
    audit('enroll_success', req, { keyHash: hashForLogs(matchedKey) });
    res.json({
        ok: true,
        activation_token: license.activationToken,
        session_token: session.sessionToken,
        session_expires_at: session.sessionExpiresAt,
        ...licenseExpiryPayload(license)
    });
});

app.post('/auth/session', (req, res) => {
    cleanupExpiredState();
    const { mod, activation_token: activationToken, device_hash: deviceHash } = req.body || {};
    if (mod !== 'customfog') {
        return res.json({ ok: false, error: 'Unknown mod' });
    }
    if (!activationToken || !deviceHash) {
        return res.json({ ok: false, error: 'Missing auth data' });
    }
    let matchedKey = null;
    let license = null;
    for (const key of Object.keys(licenses)) {
        const cand = licenses[key];
        if (cand && cand.activationToken === activationToken) {
            matchedKey = key;
            license = cand;
            break;
        }
    }
    if (!license || !matchedKey) {
        return res.json({ ok: false, error: 'Invalid activation token' });
    }
    if (license.banned) {
        return res.json({ ok: false, error: 'Key banned' });
    }
    if (licenseExpired(license)) {
        audit('session_license_expired', req, { keyHash: hashForLogs(matchedKey) });
        return res.json({ ok: false, error: 'License expired' });
    }
    if (license.boundDeviceHash !== deviceHash) {
        audit('session_device_mismatch', req, { keyHash: hashForLogs(matchedKey) });
        return res.json({ ok: false, error: 'Device mismatch' });
    }
    const session = issueSession(matchedKey, deviceHash);
    audit('session_issue', req, { keyHash: hashForLogs(matchedKey) });
    res.json({
        ok: true,
        session_token: session.sessionToken,
        session_expires_at: session.sessionExpiresAt,
        ...licenseExpiryPayload(license)
    });
});

app.post('/auth/heartbeat', (req, res) => {
    cleanupExpiredState();
    const { mod, session_token: sessionToken, device_hash: deviceHash } = req.body || {};
    if (mod !== 'customfog') {
        return res.json({ ok: false, error: 'Unknown mod' });
    }
    if (!sessionToken || !deviceHash) {
        return res.json({ ok: false, error: 'Missing heartbeat data' });
    }
    const session = sessions.get(sessionToken);
    if (!session || session.expiresAt <= Date.now()) {
        sessions.delete(sessionToken);
        return res.json({ ok: false, error: 'Session expired' });
    }
    if (session.deviceHash !== deviceHash) {
        sessions.delete(sessionToken);
        return res.json({ ok: false, error: 'Device mismatch' });
    }
    const license = licenses[session.key];
    if (!license || license.banned || license.boundDeviceHash !== deviceHash) {
        sessions.delete(sessionToken);
        return res.json({ ok: false, error: 'License invalid' });
    }
    if (licenseExpired(license)) {
        sessions.delete(sessionToken);
        audit('heartbeat_license_expired', req, { keyHash: hashForLogs(session.key) });
        return res.json({ ok: false, error: 'License expired' });
    }
    session.expiresAt = Date.now() + SESSION_TTL_MS;
    sessions.set(sessionToken, session);
    res.json({ ok: true, session_expires_at: session.expiresAt, ...licenseExpiryPayload(license) });
});

// Admin endpoint to generate keys
app.post('/admin/generate', requireAdmin, async (req, res) => {
    const {
        activations,
        note,
        allowed_device_hash: allowedDeviceHash,
        valid_days: validDays,
        valid_minutes: validMinutes,
        license_expires_at: licenseExpiresAtBody
    } = req.body;
    const key = generateLicenseKey();
    const enrollToken = crypto.randomBytes(24).toString('hex');
    let licenseExpiresAt = 0;
    if (licenseExpiresAtBody != null && licenseExpiresAtBody !== '') {
        const n = Number(licenseExpiresAtBody);
        if (Number.isFinite(n) && n > 0) {
            licenseExpiresAt = n;
        }
    } else {
        const minutes = parseInt(validMinutes, 10);
        if (Number.isFinite(minutes) && minutes > 0) {
            licenseExpiresAt = Date.now() + minutes * 60 * 1000;
        } else {
            const days = parseInt(validDays, 10);
            if (Number.isFinite(days) && days > 0) {
                licenseExpiresAt = Date.now() + days * 86400000;
            }
        }
    }
    licenses[key] = {
        activations: parseInt(activations) || 1,
        note: note || '',
        createdAt: new Date().toISOString(),
        banned: false,
        allowedDeviceHash: typeof allowedDeviceHash === 'string' ? allowedDeviceHash.trim() : '',
        enrollToken,
        licenseExpiresAt: licenseExpiresAt || undefined
    };

    await saveLicenses();

    audit('admin_generate_key', req, { keyHash: hashForLogs(key) });
    const out = {
        key: key,
        enroll_token: enrollToken,
        activations: licenses[key].activations,
        note: licenses[key].note
    };
    if (licenseExpiresAt > 0) {
        out.license_expires_at = licenseExpiresAt;
    }
    res.json(out);
});

// Admin endpoint to approve exact device for key (owner-controlled distribution)
app.post('/admin/allow-device', requireAdmin, async (req, res) => {
    const key = typeof req.body?.key === 'string' ? req.body.key.trim().toUpperCase() : '';
    const deviceHash = typeof req.body?.device_hash === 'string' ? req.body.device_hash.trim() : '';
    if (!key || !deviceHash) {
        return res.status(400).json({ error: 'key and device_hash are required' });
    }
    if (!licenses[key]) {
        return res.status(404).json({ error: 'Key not found' });
    }
    licenses[key].allowedDeviceHash = deviceHash;
    await saveLicenses();
    audit('admin_allow_device', req, { keyHash: hashForLogs(key), deviceHash: hashForLogs(deviceHash) });
    res.json({ success: true, key, device_hash: deviceHash });
});

// Admin endpoint to list keys
app.get('/admin/list', requireAdmin, (req, res) => {
    audit('admin_list_keys', req);
    res.json(licenses);
});

// Admin endpoint to ban key
app.post('/admin/ban', requireAdmin, async (req, res) => {
    const key = typeof req.body?.key === 'string' ? req.body.key.trim().toUpperCase() : '';
    if (licenses[key]) {
        licenses[key].banned = true;
        await saveLicenses();
        audit('admin_ban_key', req, { keyHash: hashForLogs(key) });
        res.json({ success: true });
    } else {
        audit('admin_ban_missing_key', req, { keyHash: hashForLogs(key) });
        res.status(404).json({ error: 'Key not found' });
    }
});

const PORT = process.env.PORT || 3000;

// Root route for testing
app.get('/', (req, res) => {
    res.json({ 
        message: 'CustomFOG License Server is running',
        status: 'ok'
    });
});

async function start() {
    await loadLicenses();
    app.listen(PORT, () => {
        console.log(`License server running on port ${PORT}`);
        console.log(`Activation endpoint: ${process.env.RENDER_EXTERNAL_URL || 'http://localhost:' + PORT}/activate`);
        console.log(`Storage mode: ${storageMode}`);
        if (storageMode !== 'upstash') {
            console.log(`License DB file: ${DB_FILE}`);
        } else {
            console.log(`Licenses redis key: ${REDIS_KEY}`);
        }
        if (!getAdminSecret()) {
            console.warn('WARNING: ADMIN_PASSWORD is not configured. Admin endpoints are disabled.');
        }
    });
}

start().catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
});
