const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());

// Add CORS headers
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
    } else {
        next();
    }
});

// Database file
const DB_FILE = path.join(__dirname, 'licenses.json');

// Load existing licenses
let licenses = {};
try {
    if (fs.existsSync(DB_FILE)) {
        const data = fs.readFileSync(DB_FILE, 'utf8');
        licenses = JSON.parse(data);
        console.log('Loaded licenses:', Object.keys(licenses).length, 'keys');
    } else {
        console.log('No licenses file found, starting empty');
    }
} catch (error) {
    console.error('Error loading licenses:', error);
    licenses = {};
}

// Generate license key
function generateLicenseKey() {
    return crypto.randomBytes(16).toString('hex').toUpperCase();
}

// Save licenses to file
function saveLicenses() {
    fs.writeFileSync(DB_FILE, JSON.stringify(licenses, null, 2));
}

// Activation endpoint
app.post('/activate', (req, res) => {
    console.log('=== ACTIVATION REQUEST ===');
    console.log('Request body:', req.body);
    console.log('Available keys:', Object.keys(licenses));
    
    const { mod, key } = req.body;
    
    console.log('Mod:', mod);
    console.log('Key:', key);
    
    if (mod !== 'customfog') {
        console.log('Unknown mod:', mod);
        return res.json({ ok: false, error: 'Unknown mod' });
    }
    
    const license = licenses[key];
    console.log('License found:', !!license);
    if (license) {
        console.log('License data:', license);
    }
    
    if (!license) {
        console.log('Invalid key:', key);
        return res.json({ ok: false, error: 'Invalid key' });
    }
    
    // Check if key was already used
    if (license.usedAt) {
        console.log('Key already used at:', license.usedAt);
        return res.json({ ok: false, error: 'Key already used' });
    }
    
    if (license.activations <= 0) {
        console.log('No activations left for key:', key);
        return res.json({ ok: false, error: 'No activations left' });
    }
    
    if (license.banned) {
        console.log('Key is banned:', key);
        return res.json({ ok: false, error: 'Key banned' });
    }
    
    // Mark as used and generate token
    license.usedAt = new Date().toISOString();
    license.activations = 0; // Set to 0 to prevent reuse
    const token = crypto.randomBytes(32).toString('hex');
    license.token = token;
    
    saveLicenses();
    
    console.log('Activation successful for key:', key);
    console.log('Token generated:', token.substring(0, 16) + '...');
    
    res.json({ 
        ok: true, 
        token: token 
    });
});

// Admin endpoint to generate keys
app.post('/admin/generate', (req, res) => {
    const { password, activations, note } = req.body;
    
    // Remove password requirement for now
    // if (password !== process.env.ADMIN_PASSWORD) {
    //     return res.status(403).json({ error: 'Wrong password' });
    // }
    
    const key = generateLicenseKey();
    licenses[key] = {
        activations: parseInt(activations) || 1,
        note: note || '',
        createdAt: new Date().toISOString(),
        banned: false
    };
    
    saveLicenses();
    
    res.json({ 
        key: key,
        activations: licenses[key].activations,
        note: licenses[key].note
    });
});

// Admin endpoint to list keys
app.get('/admin/list', (req, res) => {
    const { password } = req.query;
    
    if (password !== process.env.ADMIN_PASSWORD) {
        return res.status(403).json({ error: 'Wrong password' });
    }
    
    res.json(licenses);
});

// Admin endpoint to ban key
app.post('/admin/ban', (req, res) => {
    const { password, key } = req.body;
    
    if (password !== process.env.ADMIN_PASSWORD) {
        return res.status(403).json({ error: 'Wrong password' });
    }
    
    if (licenses[key]) {
        licenses[key].banned = true;
        saveLicenses();
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'Key not found' });
    }
});

const PORT = process.env.PORT || 3000;

// Root route for testing
app.get('/', (req, res) => {
    res.json({ 
        message: 'CustomFOG License Server is running',
        total_keys: Object.keys(licenses).length,
        available_keys: Object.keys(licenses),
        endpoints: {
            activate: 'POST /activate',
            generate: 'POST /admin/generate',
            list: 'GET /admin/list?password=xxx',
            ban: 'POST /admin/ban',
            check_keys: 'GET /check-keys',
            test_activate: 'POST /test-activate'
        }
    });
});

// Simple check-keys endpoint
app.get('/check-keys', (req, res) => {
    try {
        res.json({
            total_keys: Object.keys(licenses).length,
            keys: Object.keys(licenses)
        });
    } catch (error) {
        console.error('Error in /check-keys:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Test endpoint for manual key validation
app.post('/test-activate', (req, res) => {
    console.log('=== TEST ACTIVATION ===');
    console.log('Request body:', req.body);
    console.log('Available keys count:', Object.keys(licenses).length);
    
    const { mod, key } = req.body;
    
    console.log('Mod:', mod);
    console.log('Key:', key);
    console.log('Key length:', key ? key.length : 'undefined');
    
    if (!key) {
        console.log('ERROR: No key provided');
        return res.json({ ok: false, error: 'No key provided' });
    }
    
    if (mod !== 'customfog') {
        console.log('ERROR: Unknown mod:', mod);
        return res.json({ ok: false, error: 'Unknown mod' });
    }
    
    const license = licenses[key];
    console.log('License found:', !!license);
    
    if (!license) {
        console.log('ERROR: Invalid key');
        console.log('Available keys:', Object.keys(licenses));
        return res.json({ ok: false, error: 'Invalid key' });
    }
    
    console.log('SUCCESS: Key valid');
    return res.json({ ok: true, token: 'test-token-' + Date.now() });
});

app.listen(PORT, () => {
    console.log(`License server running on port ${PORT}`);
    console.log(`Webhook URL: ${process.env.RENDER_EXTERNAL_URL}/activate`);
});
