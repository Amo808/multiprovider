# Contributing Guide

Thank you for considering contributing to AI Chat Multi-Provider! This guide will help you get started.

## Development Setup

1. **Fork the repository**
2. **Clone your fork:**
   ```bash
   git clone https://github.com/your-username/multiprovider.git
   cd multiprovider
   ```

3. **Follow the development setup** in [RUN_INSTRUCTIONS.md](RUN_INSTRUCTIONS.md)

## Project Structure

```
multiprovider/
├── backend/              # Python FastAPI backend
│   ├── main.py          # Main application entry
│   ├── requirements.txt # Python dependencies
│   └── ...
├── frontend/            # React + TypeScript frontend
│   ├── src/            # Source code
│   ├── package.json    # Node dependencies
│   └── ...
├── adapters/           # AI provider adapters
├── storage/            # Data storage modules
└── data/              # Configuration files
```

## Code Style

### Backend (Python)
- Follow PEP 8
- Use type hints
- Format with `black`
- Sort imports with `isort`

```bash
# Format code
black .
isort .

# Check style
flake8 .
```

### Frontend (TypeScript)
- Use TypeScript strict mode
- Follow React best practices
- Use ESLint and Prettier

```bash
# Check and fix
npm run lint
npm run format
```

## Pull Request Process

1. **Create feature branch:**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**
3. **Test thoroughly**
4. **Commit with clear messages:**
   ```bash
   git commit -m "feat: add new provider support"
   ```

5. **Push and create PR:**
   ```bash
   git push origin feature/your-feature-name
   ```

## Commit Message Format

Use conventional commits:
- `feat:` new features
- `fix:` bug fixes
- `docs:` documentation
- `style:` formatting
- `refactor:` code refactoring
- `test:` adding tests
- `chore:` maintenance

## Adding New Providers

1. **Create adapter** in `/adapters/`
2. **Follow existing patterns** (see OpenAI adapter)
3. **Add configuration** to providers config
4. **Update frontend** provider list
5. **Test thoroughly**
6. **Update documentation**

## Bug Reports

Please include:
- OS and versions (Python, Node.js)
- Steps to reproduce
- Expected vs actual behavior
- Error logs if any
- Screenshots if UI related

## Feature Requests

- Check existing issues first
- Describe the problem you're solving
- Explain the proposed solution
- Consider implementation complexity

## Questions?

- Create a GitHub Discussion
- Check existing documentation
- Look at closed issues for similar problems
