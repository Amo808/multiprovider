import requests
import json

response = requests.post(
    "http://localhost:8000/api/rag/search",
    json={"query": "он проснулся", "limit": 3}
)

data = response.json()
print(f"Found {len(data['results'])} results:\n")

for r in data['results']:
    print(f"=== Chunk {r['chunk_index']} (score: {r['combined_score']:.3f}) ===")
    content = r['content']
    print(content[:500] + "..." if len(content) > 500 else content)
    print()
