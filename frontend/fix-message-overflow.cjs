const fs = require('fs');

// Fix DraggableMessageList - добавляем overflow-hidden
const listPath = 'src/components/DraggableMessageList.tsx';
let listContent = fs.readFileSync(listPath, 'utf8');

const oldList = 'className="py-6 max-w-3xl mx-auto px-4"';
const newList = 'className="py-6 max-w-3xl mx-auto px-4 overflow-hidden"';

if (listContent.includes(oldList)) {
    listContent = listContent.replace(oldList, newList);
    fs.writeFileSync(listPath, listContent);
    console.log('✅ Added overflow-hidden to DraggableMessageList');
} else if (listContent.includes(newList)) {
    console.log('ℹ️ DraggableMessageList already has overflow-hidden');
} else {
    console.log('❌ Could not find DraggableMessageList container');
}

// Fix MessageBubble - добавляем overflow-hidden на user message контейнер
const bubblePath = 'src/components/MessageBubble.tsx';
let bubbleContent = fs.readFileSync(bubblePath, 'utf8');

const oldUserMsg = 'className="max-w-[85%] md:max-w-[70%]"';
const newUserMsg = 'className="max-w-[85%] md:max-w-[70%] overflow-hidden"';

if (bubbleContent.includes(oldUserMsg)) {
    bubbleContent = bubbleContent.replace(oldUserMsg, newUserMsg);
    fs.writeFileSync(bubblePath, bubbleContent);
    console.log('✅ Added overflow-hidden to user message bubble');
} else if (bubbleContent.includes(newUserMsg)) {
    console.log('ℹ️ User message bubble already has overflow-hidden');
} else {
    console.log('❌ Could not find user message bubble');
}

console.log('Done!');
