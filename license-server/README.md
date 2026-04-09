# CustomFOG License Server

## License Server for CustomFOG Mod Protection

### Features
- License key generation and validation
- Admin panel for key management
- Persistent storage
- RESTful API
- Secure authentication

### Quick Start

1. **Install dependencies:**
```bash
npm install
```

2. **Set environment variable:**
```bash
export ADMIN_PASSWORD="your-secure-password"
```

3. **Start server:**
```bash
npm start
```

### API Endpoints

#### Bind License (Client flow)
```http
POST /auth/bind
Content-Type: application/json

{
  "mod": "customfog",
  "key": "LICENSE_KEY_HERE",
  "device_hash": "DEVICE_HASH",
  "nonce": "NONCE_FROM_/auth/challenge",
  "proof": "SHA256(nonce:key:device_hash)"
}
```

#### Silent enroll (no key input)
```http
POST /auth/enroll
Content-Type: application/json

{
  "mod": "customfog",
  "enroll_token": "PERSONAL_CLIENT_TOKEN",
  "device_hash": "DEVICE_HASH",
  "nonce": "NONCE_FROM_/auth/challenge",
  "proof": "SHA256(nonce:enroll_token:device_hash)"
}
```

#### Generate License Key (Admin)
```http
POST /admin/generate
Content-Type: application/json
X-Admin-Token: ADMIN_PASSWORD

{
  "activations": 5,
  "note": "Premium User",
  "allowed_device_hash": "OPTIONAL_DEVICE_HASH"
}
```
Response now contains:
- `key`
- `enroll_token` (put this into user's `license.properties` as `client_token=...`)

#### Approve device for key (Owner-controlled)
```http
POST /admin/allow-device
Content-Type: application/json
X-Admin-Token: ADMIN_PASSWORD

{
  "key": "LICENSE_KEY",
  "device_hash": "DEVICE_HASH"
}
```

#### List All Keys (Admin)
```http
GET /admin/list
X-Admin-Token: ADMIN_PASSWORD
```

#### Ban Key (Admin)
```http
POST /admin/ban
Content-Type: application/json
X-Admin-Token: ADMIN_PASSWORD

{
  "key": "LICENSE_KEY_TO_BAN"
}
```

### Deployment

#### Render.com (Recommended)
1. Connect this repository to Render
2. Set `ADMIN_PASSWORD` environment variable
3. Deploy automatically

#### Local Development
```bash
npm install
npm start
```

### Security Notes
- Change default admin password
- Use HTTPS in production
- Monitor usage logs
- Regular backups of licenses.json
- Keep `ADMIN_PASSWORD` secret and long
- Debug endpoints are intentionally removed in production build
- Legacy `/activate` endpoint is disabled; use `/auth/*` only
- Recommended distribution: unique `client_token` per buyer for zero-input first run

### License
MIT License - see LICENSE file
