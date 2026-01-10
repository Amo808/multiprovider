const fs = require('fs');

const chatPath = 'src/components/ChatInterface.tsx';
let content = fs.readFileSync(chatPath, 'utf8');

// Fix 1: Контейнер сообщений - добавляем overflow-x-hidden
const oldMessages = 'className="flex-1 overflow-y-auto min-h-0 ios-scroll"';
const newMessages = 'className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 ios-scroll"';

if (content.includes(oldMessages)) {
    content = content.replace(oldMessages, newMessages);
    console.log('✅ Added overflow-x-hidden to messages container');
} else if (content.includes(newMessages)) {
    console.log('ℹ️ Messages container already has overflow-x-hidden');
} else {
    console.log('❌ Could not find messages container');
}

// Fix 2: DraggableMessageList - проверим что там нет проблем
// Ищем контейнер где рендерятся сообщения

fs.writeFileSync(chatPath, content);
console.log('Done!');
