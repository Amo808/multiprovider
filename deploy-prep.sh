#!/bin/bash
# Deploy script for Render

# Check if we're in the right directory
if [ ! -f "render.yaml" ]; then
    echo "Error: render.yaml not found. Please run this script from the project root directory."
    exit 1
fi

echo "🚀 Preparing for Render deployment..."

# Ensure all necessary files are included
echo "📋 Checking required files..."
required_files=("render.yaml" "Dockerfile" "backend/main.py" "frontend/package.json" "data/config.json")
for file in "${required_files[@]}"; do
    if [ ! -f "$file" ]; then
        echo "❌ Missing required file: $file"
        exit 1
    fi
    echo "✅ Found: $file"
done

echo "📁 Project structure check complete."

# Show current configuration
echo "⚙️  Current dev mode settings:"
echo "   - DEV_MODE=1 (bypasses Google Auth)"
echo "   - VITE_DEV_MODE=1 (frontend dev mode)"
echo "   - Max tokens: 131072"
echo "   - Verbosity: high"
echo "   - Reasoning effort: high"

echo ""
echo "🔧 To deploy to Render:"
echo "1. Push this code to your GitHub repository"
echo "2. In Render dashboard, create a new Web Service"
echo "3. Connect your GitHub repository"
echo "4. Use the following settings:"
echo "   - Branch: main"
echo "   - Root Directory: (leave empty)"
echo "   - Runtime: Docker"
echo "   - Dockerfile Path: ./Dockerfile"
echo "5. Add environment variables in Render dashboard:"
echo "   - OPENAI_API_KEY: your-openai-api-key"
echo "   - ANTHROPIC_API_KEY: your-anthropic-api-key (optional)"
echo "   - DEEPSEEK_API_KEY: your-deepseek-api-key (optional)"
echo "   - JWT_SECRET: your-random-secret-key"
echo "6. Deploy!"

echo ""
echo "🌐 The app will be accessible without Google login (dev mode active)."
echo ""
echo "Ready to commit and push? (y/n)"
read -p "> " answer
if [[ $answer == "y" || $answer == "Y" ]]; then
    echo "✨ Add, commit, and push your changes to GitHub!"
    echo "   git add ."
    echo "   git commit -m 'Deploy-ready: dev mode enabled for production'"
    echo "   git push origin main"
else
    echo "👍 Manual deployment preparation complete."
fi
