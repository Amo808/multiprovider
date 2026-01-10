const fs = require('fs');
const path = 'src/components/ChatInterface.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Исправляем контейнер сообщений - добавляем overflow-x-hidden
content = content.replace(
  'className="flex-1 overflow-y-auto px-2 sm:px-4"',
  'className="flex-1 overflow-y-auto overflow-x-hidden px-2 sm:px-4"'
);

// 2. Исправляем контейнер каждого сообщения - добавляем max-w-full overflow-hidden  
content = content.replace(
  /className=\{cn\(\s*"flex w-full",/g,
  'className={cn("flex w-full max-w-full overflow-hidden",'
);

// 3. Исправляем user messages - добавляем break-words
content = content.replace(
  'max-w-[85%] rounded-2xl px-4 py-2 bg-primary text-primary-foreground',
  'max-w-[85%] rounded-2xl px-4 py-2 bg-primary text-primary-foreground overflow-hidden break-words'
);

fs.writeFileSync(path, content);
console.log('ChatInterface.tsx updated!');
