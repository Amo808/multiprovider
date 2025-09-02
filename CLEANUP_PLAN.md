# План очистки проекта

## ✅ НУЖНЫЕ файлы (НЕ удалять):

### Основные компоненты:
- `backend/` - Python FastAPI backend
- `frontend/` - React frontend  
- `adapters/` - AI провайдеры
- `.git/` - Git репозиторий
- `.gitignore` - Git конфигурация
- `README.md` - Основная документация
- `RUN_INSTRUCTIONS.md` - Инструкции запуска

### Backend файлы:
- `backend/main.py` - Основной сервер
- `backend/requirements.txt` - Python зависимости
- `backend/.env.example` - Пример конфигурации

### Frontend файлы:
- `frontend/package.json` - Node.js зависимости
- `frontend/src/` - Исходный код
- `frontend/public/` - Статические файлы
- `frontend/vite.config.ts` - Vite конфигурация
- `frontend/tailwind.config.js` - Tailwind CSS
- `frontend/tsconfig.json` - TypeScript конфигурация

## ❌ ЛИШНИЕ файлы (можно удалить):

### Дубликаты документации:
- `COMPLETE_REVERT_SUCCESS.md`
- `DATABASE.md`
- `DEEP_RESEARCH_FIX_REPORT.md`
- `DEPLOYMENT.md`
- `DEPLOYMENT_CHECKLIST.md`
- `DEPLOY_GUIDE.md`
- `DOCKER.md`
- `DOCKER_HUB.md`
- `FINAL_DEPLOY_GUIDE.md`
- `FINAL_FIX_REPORT.md`
- `FINAL_SOLUTION.md`
- `INSTANT_DEPLOY.md`
- `LOGS_FIX.md`
- `QUICK_DEPLOY.md`
- `QUICK_START.md`
- `RAILWAY.md`
- `RENDER.md`
- `RENDER_NEW.md`
- `RENDER_OLD.md`
- `START_GUIDE.md`
- `TEST_DEEP_RESEARCH.md`
- `TIMEOUT_FIX.md`
- `WORKING_VERSION_ANALYSIS.md`

### Лишние Dockerfile'ы:
- `Dockerfile.old`
- `Dockerfile.render`
- `Dockerfile.simple`
- `backend/Dockerfile.production`
- `frontend/Dockerfile.production`
- `frontend/Dockerfile.render`

### Лишние конфигурации развертывания:
- `docker-compose.hub.yml`
- `docker-compose.prod.yml`
- `docker-compose.yml`
- `render-dockerhub.yaml`
- `render-ready.yaml`
- `render-simple.yaml`
- `render.yaml`
- `railway.yaml`
- `nixpacks.toml`
- `pm2.config.json`

### Лишние nginx конфигурации:
- `nginx-simple.conf`
- `nginx.conf`
- `nginx.render.conf`
- `nginx.render.conf.backup`
- `nginx.render.conf.new`
- `nginx.server.conf`
- `supervisord.conf`
- `supervisord.conf.broken`
- `supervisord.conf.fixed`
- `supervisord.render.conf`

### Лишние скрипты:
- `build-universal.bat`
- `build-universal.sh`
- `deploy-docker.bat`
- `deploy-docker.sh`
- `deploy-hub.bat`
- `deploy-hub.sh`
- `docker-build.bat`
- `docker-build.sh`
- `install.sh`
- `render_server.py`
- `start_app.bat`
- `start_render.py`
- `start_render.sh`
- `start_simple.sh`
- `start_simple_new.sh`
- `stop_app.bat`
- `test-deployment.sh`
- `test_imports.py`

### Лишние директории:
- `data/` (если пустая или содержит только примеры)
- `logs/` (логи можно пересоздать)
- `storage/` (если не используется)

## 📝 Итоговая структура (должна остаться):

```
mulit/
├── .git/
├── .gitignore
├── README.md
├── RUN_INSTRUCTIONS.md
├── backend/
│   ├── main.py
│   ├── requirements.txt
│   ├── .env.example
│   └── data/
├── frontend/
│   ├── src/
│   ├── public/
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   └── tsconfig.json
└── adapters/
    ├── base_provider.py
    ├── openai_provider.py
    ├── chatgpt_pro_provider.py
    ├── deepseek_provider.py
    └── provider_manager.py
```
