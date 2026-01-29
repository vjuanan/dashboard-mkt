import os
import json
import sys
import urllib.request
import urllib.error

# Load .env
env_path = ".env"
config = {}
try:
    with open(env_path, "r") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, val = line.split("=", 1)
                config[key] = val.strip()
except Exception as e:
    print(f"Error reading .env: {e}")
    sys.exit(1)

SERVICE_KEY = config.get("SUPABASE_SERVICE_ROLE_KEY")
PROJECT_REF = "auqnzxrysuzypquebtpy"
BASE_URL = f"https://{PROJECT_REF}.supabase.co"

if not SERVICE_KEY:
    print("❌ No SERVICE KEY found")
    sys.exit(1)

print("🧹 Cleaning dummy data via Python (urllib)...")
headers = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json"
}

# DELETE
try:
    url = f"{BASE_URL}/rest/v1/campaigns?external_id=like.dummy_*"
    req = urllib.request.Request(url, method="DELETE")
    for k, v in headers.items():
        req.add_header(k, v)
        
    with urllib.request.urlopen(req) as resp:
        if resp.status in [200, 204]:
            print("✅ Dummy data deleted successfully.")
        else:
            print(f"❌ Delete failed: {resp.status}")
except urllib.error.HTTPError as e:
    print(f"❌ Delete error: {e.code} {e.read().decode()}")
except Exception as e:
    print(f"❌ Delete error: {e}")

print("🔄 Triggering sync...")
try:
    url = f"{BASE_URL}/functions/v1/fetch-google-ads"
    req = urllib.request.Request(url, method="POST")
    for k, v in headers.items():
        req.add_header(k, v)
        
    with urllib.request.urlopen(req) as resp:
        print("✅ Sync Success!")
        print(resp.read().decode())
except urllib.error.HTTPError as e:
    print(f"❌ Sync Failed: {e.code}")
    print("Response Body (Debug):")
    print(e.read().decode())
except Exception as e:
    print(f"❌ Sync error: {e}")
