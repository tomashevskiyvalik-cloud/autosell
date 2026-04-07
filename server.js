const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());

// Database file
const DB_FILE = path.join(__dirname, 'licenses.json');

// Load existing licenses
let licenses = {};
if (fs.existsSync(DB_FILE)) {
    licenses = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
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
    const { mod, key } = req.body;
    
    if (mod !== 'customfog') {
        return res.json({ ok: false, error: 'Unknown mod' });
    }
    
    const license = licenses[key];
    if (!license) {
        return res.json({ ok: false, error: 'Invalid key' });
    }
    
    if (license.activations <= 0) {
        return res.json({ ok: false, error: 'No activations left' });
    }
    
    if (license.banned) {
        return res.json({ ok: false, error: 'Key banned' });
    }
    
    // Decrease activations and generate token
    license.activations--;
    license.usedAt = new Date().toISOString();
    const token = crypto.randomBytes(32).toString('hex');
    license.token = token;
    
    saveLicenses();
    
    res.json({ 
        ok: true, 
        token: token 
    });
});

// Admin endpoint to generate keys
app.post('/admin/generate', (req, res) => {
    const { password, activations, note } = req.body;
    
    if (password !== process.env.ADMIN_PASSWORD) {
        return res.status(403).json({ error: 'Wrong password' });
    }
    
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
app.listen(PORT, () => {
    console.log(`License server running on port ${PORT}`);
    console.log(`Webhook URL: ${process.env.RENDER_EXTERNAL_URL}/activate`);
});
