"""
Тест Document RAG системы
Загружает тестовый документ и проверяет поиск
"""
import requests
import json

BASE_URL = "http://localhost:8000/api"
USER_EMAIL = "dev@example.com"

# Тестовый документ - фрагмент закона
TEST_DOC = """
# Гражданский кодекс Российской Федерации (тестовый фрагмент)

## Статья 1. Основные начала гражданского законодательства

1. Гражданское законодательство основывается на признании равенства участников 
регулируемых им отношений, неприкосновенности собственности, свободы договора, 
недопустимости произвольного вмешательства кого-либо в частные дела, 
необходимости беспрепятственного осуществления гражданских прав.

2. Граждане (физические лица) и юридические лица приобретают и осуществляют 
свои гражданские права своей волей и в своем интересе. Они свободны в установлении 
своих прав и обязанностей на основе договора.

## Статья 2. Отношения, регулируемые гражданским законодательством

1. Гражданское законодательство определяет правовое положение участников 
гражданского оборота, основания возникновения и порядок осуществления 
права собственности и других вещных прав.

2. Гражданское законодательство регулирует отношения между лицами, 
осуществляющими предпринимательскую деятельность, или с их участием.

## Статья 8. Основания возникновения гражданских прав и обязанностей

Гражданские права и обязанности возникают из оснований, предусмотренных законом 
и иными правовыми актами, а также из действий граждан и юридических лиц, которые 
хотя и не предусмотрены законом или такими актами, но в силу общих начал и смысла 
гражданского законодательства порождают гражданские права и обязанности.

## Статья 128. Объекты гражданских прав

К объектам гражданских прав относятся вещи, включая деньги и ценные бумаги, 
иное имущество, в том числе имущественные права; работы и услуги; 
охраняемые результаты интеллектуальной деятельности и приравненные к ним 
средства индивидуализации (интеллектуальная собственность).

## Статья 421. Свобода договора

1. Граждане и юридические лица свободны в заключении договора.
Понуждение к заключению договора не допускается, за исключением случаев, 
когда обязанность заключить договор предусмотрена настоящим Кодексом, 
законом или добровольно принятым обязательством.

2. Стороны могут заключить договор, как предусмотренный, так и не предусмотренный 
законом или иными правовыми актами.

3. Условия договора определяются по усмотрению сторон, кроме случаев, 
когда содержание соответствующего условия предписано законом.
"""


def test_upload_document():
    """Загружаем тестовый документ"""
    print("=" * 60)
    print("1. Загрузка документа...")
    
    files = {
        'file': ('test_civil_code.txt', TEST_DOC.encode('utf-8'), 'text/plain')
    }
    data = {
        'user_email': USER_EMAIL,
        'metadata': json.dumps({'type': 'law', 'name': 'ГК РФ тест'})
    }
    
    response = requests.post(f"{BASE_URL}/rag/documents/upload", files=files, data=data)
    
    if response.status_code == 200:
        result = response.json()
        print(f"✅ Документ загружен: {result}")
        return result.get('document', {}).get('id')
    else:
        print(f"❌ Ошибка: {response.status_code} - {response.text}")
        return None


def test_list_documents():
    """Список загруженных документов"""
    print("\n" + "=" * 60)
    print("2. Список документов...")
    
    response = requests.get(f"{BASE_URL}/rag/documents", params={'user_email': USER_EMAIL})
    
    if response.status_code == 200:
        result = response.json()
        print(f"✅ Найдено документов: {result['total']}")
        for doc in result['documents']:
            print(f"   - {doc['name']} (status: {doc['status']}, chunks: {doc.get('total_chunks', '?')})")
        return result['documents']
    else:
        print(f"❌ Ошибка: {response.status_code} - {response.text}")
        return []


def test_search(query: str):
    """Поиск в документах"""
    print("\n" + "=" * 60)
    print(f"3. Поиск: '{query}'")
    
    response = requests.post(
        f"{BASE_URL}/rag/search",
        params={'user_email': USER_EMAIL},
        json={
            'query': query,
            'limit': 3,
            'use_hybrid': True
        }
    )
    
    if response.status_code == 200:
        result = response.json()
        print(f"✅ Найдено результатов: {len(result['results'])}")
        for i, r in enumerate(result['results'], 1):
            print(f"\n--- Результат {i} (similarity: {r.get('similarity', '?'):.3f}) ---")
            content = r['content'][:300] + "..." if len(r['content']) > 300 else r['content']
            print(content)
        return result
    else:
        print(f"❌ Ошибка: {response.status_code} - {response.text}")
        return None


def test_rag_context(query: str):
    """Получить RAG контекст для запроса"""
    print("\n" + "=" * 60)
    print(f"4. RAG контекст для: '{query}'")
    
    response = requests.post(
        f"{BASE_URL}/rag/context",
        params={'user_email': USER_EMAIL},
        json={
            'query': query,
            'max_tokens': 2000,
            'use_hybrid': True
        }
    )
    
    if response.status_code == 200:
        result = response.json()
        print(f"✅ Контекст построен ({len(result['context'])} символов)")
        print(f"   Источников: {len(result['sources'])}")
        print("\n--- КОНТЕКСТ (первые 500 символов) ---")
        print(result['context'][:500] + "...")
        return result
    else:
        print(f"❌ Ошибка: {response.status_code} - {response.text}")
        return None


if __name__ == "__main__":
    print("\n" + "=" * 60)
    print("      ТЕСТ DOCUMENT RAG СИСТЕМЫ")
    print("=" * 60)
    
    # 1. Загрузка документа
    doc_id = test_upload_document()
    
    # 2. Список документов
    import time
    time.sleep(2)  # Подождать обработки
    docs = test_list_documents()
    
    # 3. Поиск по разным запросам
    test_search("свобода договора")
    test_search("права собственности")
    test_search("юридические лица и граждане")
    
    # 4. RAG контекст
    test_rag_context("Какие права есть у юридических лиц по ГК РФ?")
    
    print("\n" + "=" * 60)
    print("ТЕСТ ЗАВЕРШЁН")
    print("=" * 60)
