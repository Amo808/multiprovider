const fs = require('fs');

// ===== FIX 1: RAG Popup - make it fixed on desktop too =====
const ragPath = 'src/components/RAGUnifiedButton.tsx';
let ragContent = fs.readFileSync(ragPath, 'utf8');

// Меняем md:absolute на fixed для десктопа тоже
// Проблема: absolute popup обрезается overflow:hidden родителя
ragContent = ragContent.replace(
    `className="fixed md:absolute bottom-0 md:bottom-full left-0 right-0 md:left-auto md:right-auto md:mb-2 
              w-full md:w-96 max-h-[80vh] md:max-h-[70vh] bg-card border border-border 
              rounded-t-2xl md:rounded-xl shadow-2xl z-50 flex flex-col
              animate-in slide-in-from-bottom-4 md:slide-in-from-bottom-2 duration-200"`,
    `className="fixed bottom-0 left-0 right-0 md:bottom-auto md:top-auto md:left-1/2 md:-translate-x-1/2 md:bottom-20
              w-full md:w-96 max-h-[80vh] md:max-h-[70vh] bg-card border border-border 
              rounded-t-2xl md:rounded-xl shadow-2xl z-50 flex flex-col
              animate-in slide-in-from-bottom-4 md:slide-in-from-bottom-2 duration-200"`
);

fs.writeFileSync(ragPath, ragContent);
console.log('✅ Fixed RAG popup positioning (now fixed on all devices)');

// ===== FIX 2: Chat overflow - prevent horizontal scroll =====
const chatPath = 'src/components/ChatInterface.tsx';
let chatContent = fs.readFileSync(chatPath, 'utf8');

// Добавляем overflow-x-hidden на контейнер сообщений
if (!chatContent.includes('overflow-x-hidden')) {
    chatContent = chatContent.replace(
        'className="flex-1 overflow-y-auto px-2 sm:px-4"',
        'className="flex-1 overflow-y-auto overflow-x-hidden px-2 sm:px-4"'
    );
    console.log('✅ Added overflow-x-hidden to messages container');
}

// Добавляем word-break на сообщения пользователя
if (!chatContent.includes('break-words')) {
    chatContent = chatContent.replace(
        'max-w-[85%] rounded-2xl px-4 py-2 bg-primary text-primary-foreground',
        'max-w-[85%] rounded-2xl px-4 py-2 bg-primary text-primary-foreground break-words'
    );
    console.log('✅ Added break-words to user messages');
}

fs.writeFileSync(chatPath, chatContent);
console.log('✅ Fixed chat horizontal overflow');
