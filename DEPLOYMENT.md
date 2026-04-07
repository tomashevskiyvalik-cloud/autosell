# Deploy CustomFOG License Server on Render.com

## Step 1: Prepare GitHub Repository

1. Create new GitHub repository
2. Upload all files from license-server folder
3. Make sure .gitignore includes sensitive files

## Step 2: Deploy to Render

1. Go to [render.com](https://render.com)
2. Sign up (use GitHub account)
3. Click "New +" -> "Web Service"
4. Connect your GitHub repository
5. Configure:
   - **Name:** customfog-license-server
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Instance Type:** Free

## Step 3: Configure Environment Variables

Add Environment Variable in Render dashboard:
- **Key:** `ADMIN_PASSWORD`
- **Value:** `your-secure-admin-password`

## Step 4: Update Server Code

Replace YOUR_ADMIN_PASSWORD in server.js with:
```javascript
if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(403).json({ error: 'Wrong password' });
}
```

## Step 5: Get Your URL

After deployment, Render will give you URL like:
`https://customfog-license-server.onrender.com`

Your activation endpoint will be:
`https://customfog-license-server.onrender.com/activate`

## Step 6: Update Mod Configuration

In your mod config file:
```properties
endpoint=https://customfog-license-server.onrender.com/activate
```

## Alternative: Railway.app

1. Go to [railway.app](https://railway.app)
2. Connect GitHub
3. Select repository
4. Railway will auto-detect Node.js
5. Set environment variables
6. Deploy!

## Alternative: Vercel (Serverless)

Need to restructure as serverless function:

```javascript
// api/activate.js
export default function handler(req, res) {
    // Your server logic here
}
```

## Testing Your Server

```bash
# Test activation endpoint
curl -X POST https://your-url.onrender.com/activate \
  -H "Content-Type: application/json" \
  -d '{"mod":"customfog","key":"test-key"}'

# Test admin endpoint
curl -X POST https://your-url.onrender.com/admin/generate \
  -H "Content-Type: application/json" \
  -d '{"password":"your-admin-password","activations":5}'
```

## Important Notes

1. **Free tier sleep:** Render sleeps after 15min inactivity, wakes in ~30sec
2. **Data persistence:** Database file persists between deployments
3. **Security:** Use environment variables for passwords
4. **HTTPS:** Automatic SSL certificate included

## Recommended Setup

**Render.com** is best choice because:
- Reliable free tier
- Easy GitHub integration
- Automatic HTTPS
- Good performance
- Simple setup
