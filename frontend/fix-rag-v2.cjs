const fs = require('fs');

// ===== FIX RAG Popup on Desktop =====
const ragPath = 'src/components/RAGUnifiedButton.tsx';
let content = fs.readFileSync(ragPath, 'utf8');

// Ищем popup div и меняем его позиционирование
// Проблема: на десктопе md:absolute обрезается overflow:hidden родителя
// Решение: делаем fixed на всех устройствах и центрируем на десктопе

const oldPopup = `className="fixed md:absolute bottom-0 md:bottom-full left-0 right-0 md:left-auto md:right-auto md:mb-2 
              w-full md:w-96 max-h-[80vh] md:max-h-[70vh] bg-card border border-border 
              rounded-t-2xl md:rounded-xl shadow-2xl z-50 flex flex-col
              animate-in slide-in-from-bottom-4 md:slide-in-from-bottom-2 duration-200"`;

const newPopup = `className="fixed inset-x-0 bottom-0 md:inset-auto md:left-1/2 md:bottom-24 md:-translate-x-1/2
              w-full md:w-96 max-h-[80vh] md:max-h-[70vh] bg-card border border-border 
              rounded-t-2xl md:rounded-xl shadow-2xl z-50 flex flex-col
              animate-in slide-in-from-bottom-4 md:slide-in-from-bottom-2 duration-200"`;

if (content.includes(oldPopup)) {
    content = content.replace(oldPopup, newPopup);
    fs.writeFileSync(ragPath, content);
    console.log('✅ Fixed RAG popup - now uses fixed positioning on desktop too');
} else {
    console.log('❌ Could not find popup class to replace');
    console.log('Trying alternative approach...');

    // Попробуем заменить только ключевую часть
    const oldKey = 'fixed md:absolute bottom-0 md:bottom-full left-0 right-0 md:left-auto md:right-auto md:mb-2';
    const newKey = 'fixed inset-x-0 bottom-0 md:inset-auto md:left-1/2 md:bottom-24 md:-translate-x-1/2';

    if (content.includes(oldKey)) {
        content = content.replace(oldKey, newKey);
        fs.writeFileSync(ragPath, content);
        console.log('✅ Fixed RAG popup (alternative method)');
    } else {
        console.log('❌ Alternative method also failed');

        // Покажем что там сейчас
        const match = content.match(/className="fixed[^"]*md:absolute[^"]*"/);
        if (match) {
            console.log('Current popup class:', match[0].substring(0, 100) + '...');
        }
    }
}
