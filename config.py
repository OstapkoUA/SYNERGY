import os
import json
from pathlib import Path

BASE_DIR = Path(__file__).parent
DATA_FILE = BASE_DIR / "services.json"

def load_json():
    with open(DATA_FILE, 'r', encoding='utf-8') as f:
        return json.load(f)

BOT_TOKEN = os.getenv("BOT_TOKEN", "")
ALTEGIO_URL = os.getenv("ALTEGIO_BOOKING_URL", "https://n816358.alteg.io/company/766796/personal/menu?o=")
ADMIN_IDS = [int(id.strip()) for id in os.getenv("ADMIN_IDS", "").split(",") if id.strip().isdigit()]

BOOKING_PARAMS = {
    "base": ALTEGIO_URL,
    "client_name": "name",
    "client_phone": "phone",
    "service": "service",
    "master": "worker",
}

data = load_json()
