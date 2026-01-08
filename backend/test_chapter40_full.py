"""
Тест: Проверка что ВСЯ глава 40 извлекается полностью
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from supabase_client.rag import get_rag_store
from supabase_client.client import get_or_create_user

# Эталонный текст главы 40 для сравнения (первые и последние строки)
CHAPTER_40_START = "ГЛАВА 40"
CHAPTER_40_KEY_PHRASES = [
    "Дверь апартаментов Квадрата отворилась беззвучно",
    "на шее проступали сине-багровые следы",
    "Треугольник развернул Квадрата к выходу",
    "Нас ждет новое утро. Одно на двоих. Общее и неделимое.",
]
CHAPTER_40_END_MARKER = "ГЛАВА 41"

def main():
    user_email = "dev@example.com"
    rag_store = get_rag_store()
    
    print("=" * 80)
    print("🔍 ТЕСТ: Полнота извлечения главы 40")
    print("=" * 80)
    
    # Get documents
    docs = rag_store.list_documents(user_email, status="ready")
    if not docs:
        print("❌ Нет документов!")
        return
    
    doc_id = docs[0]["id"]
    doc_name = docs[0]["name"]
    print(f"\n📚 Документ: {doc_name}")
    print(f"   ID: {doc_id}")
    
    # ========================================
    # ТЕСТ 1: Получить ВСЕ чанки документа
    # ========================================
    print("\n" + "-" * 60)
    print("📊 ТЕСТ 1: Анализ чанков в базе данных")
    print("-" * 60)
    
    all_chunks = rag_store.get_all_document_chunks(user_email, [doc_id])
    print(f"Всего чанков в документе: {len(all_chunks)}")
    
    # Найти чанки с "ГЛАВА 40"
    chapter_40_chunks = []
    chapter_40_start_idx = None
    chapter_41_start_idx = None
    
    for chunk in all_chunks:
        content = chunk.get("content", "")
        idx = chunk.get("chunk_index", 0)
        
        if "ГЛАВА 40" in content and chapter_40_start_idx is None:
            chapter_40_start_idx = idx
            print(f"\n✅ Найдено начало главы 40 в чанке #{idx}")
            print(f"   Превью: {content[:200]}...")
        
        if "ГЛАВА 41" in content and chapter_41_start_idx is None:
            chapter_41_start_idx = idx
            print(f"\n✅ Найдено начало главы 41 в чанке #{idx}")
    
    if chapter_40_start_idx is not None and chapter_41_start_idx is not None:
        # Собрать все чанки главы 40
        for chunk in all_chunks:
            idx = chunk.get("chunk_index", 0)
            if chapter_40_start_idx <= idx < chapter_41_start_idx:
                chapter_40_chunks.append(chunk)
        
        print(f"\n📖 Глава 40 занимает чанки: {chapter_40_start_idx} - {chapter_41_start_idx - 1}")
        print(f"   Всего чанков в главе 40: {len(chapter_40_chunks)}")
        
        # Собрать полный текст главы 40 из чанков
        full_chapter_text = "\n".join([c["content"] for c in chapter_40_chunks])
        print(f"   Общая длина текста: {len(full_chapter_text)} символов")
        print(f"   Примерно токенов: {len(full_chapter_text) // 4}")
    
    # ========================================
    # ТЕСТ 2: Проверить ключевые фразы
    # ========================================
    print("\n" + "-" * 60)
    print("🔑 ТЕСТ 2: Проверка ключевых фраз главы 40")
    print("-" * 60)
    
    for phrase in CHAPTER_40_KEY_PHRASES:
        found = phrase in full_chapter_text
        status = "✅" if found else "❌"
        print(f"{status} '{phrase[:50]}...' - {'НАЙДЕНО' if found else 'НЕ НАЙДЕНО'}")
    
    # ========================================
    # ТЕСТ 3: Использовать Smart RAG
    # ========================================
    print("\n" + "-" * 60)
    print("🧠 ТЕСТ 3: Smart RAG - извлечение главы 40")
    print("-" * 60)
    
    # Проверим есть ли метод smart_rag_search
    if hasattr(rag_store, 'smart_rag_search'):
        result = rag_store.smart_rag_search(
            query="Перескажи что происходит в главе 40",
            user_email=user_email,
            document_id=doc_id
        )
        
        context = result.get("context", "")
        sources = result.get("sources", [])
        debug = result.get("debug", {})
        
        print(f"\n📋 Smart RAG результат:")
        print(f"   Intent: {debug.get('intent', {})}")
        print(f"   Контекст: {len(context)} символов")
        print(f"   Sources: {len(sources)}")
        
        # Проверить что ключевые фразы есть в контексте
        print(f"\n   Проверка полноты контекста:")
        for phrase in CHAPTER_40_KEY_PHRASES:
            found = phrase in context
            status = "✅" if found else "❌"
            print(f"   {status} '{phrase[:40]}...'")
    else:
        print("⚠️ smart_rag_search не найден, используем build_chapter_context")
    
    # ========================================
    # ТЕСТ 4: Прямое извлечение главы
    # ========================================
    print("\n" + "-" * 60)
    print("📖 ТЕСТ 4: Прямое извлечение get_chapter_content")
    print("-" * 60)
    
    content, sources = rag_store.get_chapter_content(user_email, doc_id, "40")
    
    print(f"Длина контента: {len(content)} символов")
    print(f"Количество sources: {len(sources)}")
    
    # Проверить ключевые фразы
    print(f"\nПроверка ключевых фраз:")
    all_found = True
    for phrase in CHAPTER_40_KEY_PHRASES:
        found = phrase in content
        status = "✅" if found else "❌"
        if not found:
            all_found = False
        print(f"   {status} '{phrase[:50]}...'")
    
    # Проверить начало и конец
    has_start = "ГЛАВА 40" in content
    has_end = "Одно на двоих" in content or "Общее и неделимое" in content
    
    print(f"\n{'✅' if has_start else '❌'} Заголовок 'ГЛАВА 40' присутствует")
    print(f"{'✅' if has_end else '❌'} Концовка главы присутствует")
    
    # ========================================
    # ИТОГ
    # ========================================
    print("\n" + "=" * 80)
    print("📊 ИТОГОВЫЙ РЕЗУЛЬТАТ")
    print("=" * 80)
    
    if all_found and has_start and has_end:
        print("✅ ВСЯ ГЛАВА 40 ПОЛНОСТЬЮ ИЗВЛЕКАЕТСЯ!")
        print(f"   - {len(chapter_40_chunks)} чанков")
        print(f"   - {len(content)} символов")
        print(f"   - ~{len(content) // 4} токенов")
    else:
        print("❌ ГЛАВА 40 ИЗВЛЕКАЕТСЯ НЕ ПОЛНОСТЬЮ!")
        print("   Проверьте чанкинг и метаданные")
    
    # Показать первые и последние 500 символов
    print("\n" + "-" * 60)
    print("📝 Первые 500 символов извлеченного контента:")
    print("-" * 60)
    print(content[:500])
    
    print("\n" + "-" * 60)
    print("📝 Последние 500 символов извлеченного контента:")
    print("-" * 60)
    print(content[-500:])

if __name__ == "__main__":
    main()
