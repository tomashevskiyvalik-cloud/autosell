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

#### Activate License
```http
POST /activate
Content-Type: application/json

{
  "mod": "customfog",
  "key": "LICENSE_KEY_HERE"
}
```

#### Generate License Key (Admin)
```http
POST /admin/generate
Content-Type: application/json

{
  "password": "ADMIN_PASSWORD",
  "activations": 5,
  "note": "Premium User"
}
```

#### List All Keys (Admin)
```http
GET /admin/list?password=ADMIN_PASSWORD
```

#### Ban Key (Admin)
```http
POST /admin/ban
Content-Type: application/json

{
  "password": "ADMIN_PASSWORD",
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

### License
MIT License - see LICENSE file
