@echo off
echo 🚀 Preparing for GitHub push and Render deployment...
echo.

REM Check if git is initialized
if not exist ".git" (
    echo ❌ Git repository not found. Initializing...
    git init
    echo ✅ Git repository initialized.
)

echo 📁 Adding all files to git...
git add .

echo 📝 Committing changes...
set /p commit_msg="Enter commit message (or press Enter for default): "
if "%commit_msg%"=="" set commit_msg=Deploy-ready: dev mode enabled for production

git commit -m "%commit_msg%"

echo 🌐 Current git status:
git status --porcelain

echo.
echo 🔧 Current configuration:
echo    - Dev mode: ENABLED (no Google login required)
echo    - Max tokens: 131,072
echo    - Verbosity: high
echo    - Reasoning effort: high
echo    - All providers ready
echo.

set /p push_confirm="Push to GitHub now? (y/n): "
if /i "%push_confirm%"=="y" (
    echo 📤 Pushing to GitHub...
    
    REM Check if remote exists
    git remote -v | findstr origin >nul
    if errorlevel 1 (
        echo ❌ No remote 'origin' found. Please add your GitHub repository:
        echo    git remote add origin https://github.com/yourusername/yourrepo.git
        pause
        exit /b 1
    )
    
    git push origin main
    echo.
    echo ✅ Successfully pushed to GitHub!
    echo.
    echo 🎯 Next steps:
    echo    1. Go to render.com dashboard
    echo    2. Create new Web Service
    echo    3. Connect your GitHub repository  
    echo    4. Add OPENAI_API_KEY environment variable
    echo    5. Deploy!
    echo.
    echo 📖 See DEPLOY_RENDER.md for detailed instructions.
) else (
    echo 👍 Commit created. Push manually when ready:
    echo    git push origin main
)

echo.
pause
