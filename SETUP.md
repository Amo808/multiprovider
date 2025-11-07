# ⚡ Quick Setup Guide

## 1. Install Dependencies

### Backend
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

### Frontend
```bash
cd frontend
npm install
```

## 2. Configuration (Optional)

Create `.env` file in root:
```bash
OPENAI_API_KEY=your_openai_key
DEEPSEEK_API_KEY=your_deepseek_key
ANTHROPIC_API_KEY=your_anthropic_key
```

Create `frontend/.env.local`:
```bash
VITE_GOOGLE_CLIENT_ID=your_google_client_id
```

## 3. Run Application

### Terminal 1 (Backend)
```bash
cd backend
.venv\Scripts\python main.py --timeout 300
```

### Terminal 2 (Frontend)
```bash
cd frontend
npm run dev
```

## 4. Access
- **App**: http://localhost:3000
- **API**: http://localhost:8000

## 🎉 That's it!
The app runs in dev mode by default - no login required!
