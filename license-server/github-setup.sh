#!/bin/bash

# GitHub Repository Setup Script
echo "=== CustomFOG License Server GitHub Setup ==="

# Repository details
REPO_NAME="customfog-license-server"
REPO_DESC="License server for CustomFOG mod protection"

echo "1. Creating repository on GitHub..."
echo "   Go to: https://github.com/new"
echo "   Name: $REPO_NAME"
echo "   Description: $REPO_DESC"
echo "   Visibility: Public"
echo "   Check: Add README file"
echo ""

echo "2. After creating repository, run these commands:"
echo ""

# Git commands
echo "# Initialize local repository"
echo "git init"
echo "git add ."
echo "git commit -m 'Initial commit - license server for CustomFOG'"
echo ""

echo "# Add remote repository"
echo "git remote add origin https://github.com/YOUR_USERNAME/$REPO_NAME.git"
echo ""

echo "# Push to GitHub"
echo "git branch -M main"
echo "git push -u origin main"
echo ""

echo "3. Repository ready for deployment to Render.com!"
echo "   Your URL will be: https://github.com/YOUR_USERNAME/$REPO_NAME"
