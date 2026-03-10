"""Quick check: are all yario skills disabled?"""
import requests
r = requests.get("http://127.0.0.1:8000/api/openclaw/skills")
data = r.json()
for s in data.get("skills", []):
    if "yario" in s.get("name", ""):
        print(f"  {s['name']:20s}  disabled={s.get('disabled')}")
print("---")
# Also test sending a message to see identity
print("All yario skills check complete")
