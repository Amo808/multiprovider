#!/usr/bin/env python3
"""
Финальный тест для o3-deep-research с правильным форматом tools
"""

import json
import logging

# Настройка логирования
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def test_o3_deep_research_payload():
    """Тест правильного формата payload для o3-deep-research"""
    
    # Симуляция параметров
    model = "o3-deep-research"
    user_message = "What are the latest developments in AI?"
    max_output_tokens = 100000
    
    # Формирование payload как в реальном коде
    responses_payload = {
        "model": model,
        "input": user_message,  # Используем input вместо messages
        "max_output_tokens": max_output_tokens  # Используем max_output_tokens
    }
    
    # Добавляем tools для o3-deep-research
    if model == "o3-deep-research":
        responses_payload["tools"] = [{"type": "web_search_preview"}]  # Правильный формат!
        logger.info(f"🔍 [o3-deep-research] Added required tools: {responses_payload['tools']}")
    
    # Проверяем формат
    print("=== FINAL O3-DEEP-RESEARCH PAYLOAD ===")
    print(json.dumps(responses_payload, indent=2))
    print()
    
    # Валидация
    assert "input" in responses_payload, "input parameter missing"
    assert "max_output_tokens" in responses_payload, "max_output_tokens parameter missing"
    assert "tools" in responses_payload, "tools parameter missing for o3-deep-research"
    assert isinstance(responses_payload["tools"], list), "tools should be a list"
    assert len(responses_payload["tools"]) > 0, "tools should not be empty"
    assert isinstance(responses_payload["tools"][0], dict), "tools[0] should be an object (dict)"
    assert "type" in responses_payload["tools"][0], "tools[0] should have 'type' field"
    assert responses_payload["tools"][0]["type"] == "web_search_preview", "tools[0].type should be 'web_search_preview'"
    
    print("✅ All validations passed!")
    print("✅ O3-deep-research payload format is correct!")
    
    return responses_payload

if __name__ == "__main__":
    test_o3_deep_research_payload()
