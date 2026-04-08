# GitHub Setup Guide

## Quick Setup (Web Interface)

1. **Create Repository:**
   - Go to [github.com/new](https://github.com/new)
   - Name: `customfog-license-server`
   - Description: `License server for CustomFOG mod protection`
   - Visibility: Public
   - Check: "Add README file"
   - Click "Create repository"

2. **Upload Files:**
   - Click "Add file" -> "Upload files"
   - Drag & drop these files:
     - `server.js`
     - `package.json`
     - `Procfile`
     - `.gitignore`
     - `README.md`
     - `LICENSE`
   - Commit changes: "Initial commit - license server for CustomFOG"

## Professional Setup (Git Commands)

```bash
# 1. Initialize Git repository
git init
git add .
git commit -m "Initial commit - license server for CustomFOG"

# 2. Connect to GitHub (replace YOUR_USERNAME)
git remote add origin https://github.com/YOUR_USERNAME/customfog-license-server.git

# 3. Push to GitHub
git branch -M main
git push -u origin main
```

## Next Steps

After creating repository:

1. **Verify files are uploaded**
2. **Test locally:** `npm install && npm start`
3. **Deploy to Render:**
   - Go to [render.com](https://render.com)
   - Connect GitHub repository
   - Set environment variable: `ADMIN_PASSWORD`
   - Deploy!

## Repository URL Example
`https://github.com/yourusername/customfog-license-server`

## Render Deployment URL Example
`https://customfog-license-server.onrender.com`
