const fs = require('fs');
const path = 'supabase_client/rag.py';
let content = fs.readFileSync(path, 'utf8');

// ПРОБЛЕМА: Когда пользователь ставит 5% чанков, система всё равно грузит
// весь документ для запросов "о чём книга" и потом сжимает его.
// 
// ИСПРАВЛЕНИЕ: Уважать chunk_percent настройку пользователя ВСЕГДА.
// Если пользователь поставил 5%, грузить только 5% чанков, не весь документ.

// Находим условие проверки "percent mode" в smart_rag_pipeline
// Текущее: if target_chunks < len(all_chunks) * 0.8
// Нужно: if chunk_percent < 80 (чтобы любой процент < 80% переключался на search)

const oldCondition = `elif chunk_mode == "percent":
                if target_chunks < len(all_chunks) * 0.8:
                    user_wants_limited = True
                    logger.info(f"[SMART-RAG] ✓ User set PERCENT mode ({chunk_percent}%) = {target_chunks} chunks - switching to search")
                else:
                    logger.info(f"[SMART-RAG] Percent mode but target({target_chunks}) >= 80% of total - keeping full_document")`;

const newCondition = `elif chunk_mode == "percent":
                # FIXED: Respect user's explicit percentage choice!
                # If user set ANY percentage < 80%, use search mode to respect it
                if chunk_percent < 80:
                    user_wants_limited = True
                    logger.info(f"[SMART-RAG] ✓ User set PERCENT mode ({chunk_percent}%) = {target_chunks} chunks - switching to search")
                else:
                    logger.info(f"[SMART-RAG] Percent mode at {chunk_percent}% (>= 80%) - keeping full_document")`;

if (content.includes(oldCondition)) {
    content = content.replace(oldCondition, newCondition);
    console.log('✅ Fixed: chunk_percent now respected for full_document requests');
} else {
    console.log('❌ Could not find percent mode condition');
    // Попробуем найти альтернативно
    const alt = 'target_chunks < len(all_chunks) * 0.8:';
    if (content.includes(alt)) {
        console.log('Found alternative pattern, trying to replace...');
        content = content.replace(
            'if target_chunks < len(all_chunks) * 0.8:',
            'if chunk_percent < 80:  # FIXED: Respect user percentage directly'
        );
        console.log('✅ Fixed via alternative method');
    }
}

// Также добавим лучший fallback - если chunk_percent < 100, всегда учитывать
const oldAdaptive = `elif chunk_mode == "adaptive":
                # In adaptive mode, check if target_chunks is significantly less than total
                if target_chunks < len(all_chunks) * 0.5:
                    user_wants_limited = True
                    logger.info(f"[SMART-RAG] ✓ ADAPTIVE mode but target({target_chunks}) < 50% of total({len(all_chunks)}) - switching to search")
                else:
                    logger.info(f"[SMART-RAG] Adaptive mode, target({target_chunks}) is sufficient - keeping full_document")`;

const newAdaptive = `elif chunk_mode == "adaptive":
                # In adaptive mode, check max_percent_limit (user's cap setting)
                if max_percent_limit < 80:
                    user_wants_limited = True
                    logger.info(f"[SMART-RAG] ✓ ADAPTIVE mode with max_percent_limit={max_percent_limit}% < 80% - switching to search")
                elif target_chunks < len(all_chunks) * 0.5:
                    user_wants_limited = True
                    logger.info(f"[SMART-RAG] ✓ ADAPTIVE mode but target({target_chunks}) < 50% of total({len(all_chunks)}) - switching to search")
                else:
                    logger.info(f"[SMART-RAG] Adaptive mode, target({target_chunks}) is sufficient - keeping full_document")`;

if (content.includes(oldAdaptive)) {
    content = content.replace(oldAdaptive, newAdaptive);
    console.log('✅ Fixed: adaptive mode now checks max_percent_limit');
}

fs.writeFileSync(path, content);
console.log('');
console.log('Summary: Now when user sets chunk_percent < 80%, system will use');
console.log('semantic search instead of loading full document.');
