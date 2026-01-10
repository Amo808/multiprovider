const fs = require('fs');
const path = 'src/components/ChatInterface.tsx';
let content = fs.readFileSync(path, 'utf8');

// Проблема: overflow-hidden на родительском контейнере обрезает RAG popup
// Решение: убираем overflow-hidden с контейнера input area

// 1. Убираем overflow-hidden с внешнего контейнера
content = content.replace(
    'className="max-w-3xl mx-auto w-full overflow-hidden"',
    'className="max-w-3xl mx-auto w-full"'
);

// 2. Убираем overflow-hidden с внутреннего контейнера формы (оставляем overflow-visible)
content = content.replace(
    /className="relative flex items-end bg-secondary\/50 border border-border rounded-2xl shadow-sm focus-within:ring-2 focus-within:ring-ring focus-within:border-ring transition-all overflow-hidden max-w-full"/g,
    'className="relative flex items-end bg-secondary/50 border border-border rounded-2xl shadow-sm focus-within:ring-2 focus-within:ring-ring focus-within:border-ring transition-all max-w-full"'
);

fs.writeFileSync(path, content);
console.log('✅ Fixed: Removed overflow-hidden from input container to allow RAG popup to show');
