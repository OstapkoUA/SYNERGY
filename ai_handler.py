import json
import os
from pathlib import Path
from telegram import InlineKeyboardButton, InlineKeyboardMarkup

BASE_DIR = Path(__file__).parent
ADMINS_FILE = BASE_DIR / "admins.json"

with open(ADMINS_FILE, 'r', encoding='utf-8') as f:
    ADMS_DATA = json.load(f)

SYSTEM_PROMPT = """Ти - дружній адміністратор салону краси SYNERGY. 
Твоя роль - допомогти клієнту записатися на послугу.
Послуги: Лазерна епіляція (Соломія Бараняк, Леся Корнят), Косметологія (Ілона), Масаж (Владислав), Аквасфера (Оля Волинська).
Відповідай коротко і по суті. Не питай зайвих питань - веди клієнта до запису."""

class AIHandler:
    def __init__(self):
        self.conversations = {}
        self.ai_history = {}
    
    async def chat_with_ai(self, user_id, message):
        if user_id not in self.ai_history:
            self.ai_history[user_id] = [{"role": "system", "content": SYSTEM_PROMPT}]
        
        self.ai_history[user_id].append({"role": "user", "content": message})
        
        try:
            return None
        except Exception as e:
            return None
    
    def clear_ai_history(self, user_id):
        if user_id in self.ai_history:
            del self.ai_history[user_id]
    
    def start_booking(self, user_id, category):
        self.conversations[user_id] = {
            "category": category,
            "step": "first_question",
            "data": {}
        }
        category_data = ADMS_DATA["categories"][category]
        return category_data["first_time_question"]
    
    def get_services_buttons(self, category):
        services = ADMS_DATA["services"].get(category, [])
        keyboard = []
        for i, service in enumerate(services):
            keyboard.append([InlineKeyboardButton(
                f"{service['name']} - {service['price']}",
                callback_data=f"ai_service_{category}_{i}"
            )])
        keyboard.append([InlineKeyboardButton("🔙 Назад", callback_data="ai_back_first_q")])
        keyboard.append([InlineKeyboardButton("🔙 На головну", callback_data="back_main")])
        return InlineKeyboardMarkup(keyboard)
    
    def get_workers_buttons(self, category):
        workers = ADMS_DATA["categories"][category]["workers"]
        keyboard = []
        for worker in workers:
            keyboard.append([InlineKeyboardButton(
                f"{worker['name']} - {worker['role']}",
                callback_data=f"ai_worker_{worker['id']}"
            )])
        keyboard.append([InlineKeyboardButton("🔙 Назад", callback_data="ai_back_services")])
        return InlineKeyboardMarkup(keyboard)
    
    def get_continue_buttons(self):
        return InlineKeyboardMarkup([
            [InlineKeyboardButton("Продовжити", callback_data="ai_continue")],
            [InlineKeyboardButton("На головну", callback_data="back_main")]
        ])
    
    def handle_response(self, user_id, message, context):
        conv = self.conversations.get(user_id, {})
        if not conv:
            return None
        
        step = conv.get("step")
        
        if step == "enter_name":
            conv["data"]["name"] = message
            conv["step"] = "enter_phone"
            return "Введіть ваш номер телефону:"
        
        elif step == "enter_phone":
            conv["data"]["phone"] = message
            conv["step"] = "enter_datetime"
            return "Введіть зручну дату та час для запису:\n(Наприклад: 15.04.2026 о 14:00)"
        
        elif step == "enter_datetime":
            conv["data"]["datetime"] = message
            return self.generate_booking_summary(conv["data"], conv["category"])
        
        return None
    
    def generate_booking_summary(self, data, category):
        worker = ADMS_DATA["categories"][category]["workers"][0]
        service = ADMS_DATA["services"][category][data.get("service_index", 0)]
        
        url = ADMS_DATA["altegio_url"]
        
        summary = (
            f"📋 <b>Ваш запит на запис:</b>\n\n"
            f"👤 Ім'я: <b>{data['name']}</b>\n"
            f"📱 Телефон: <b>{data['phone']}</b>\n"
            f"💆 Послуга: <b>{service['name']}</b>\n"
            f"👩‍⚕️ Спеціаліст: <b>{worker['name']}</b>\n"
            f"🕐 Дата/час: <b>{data['datetime']}</b>\n\n"
            f"Натисніть кнопку нижче для завершення запису:"
        )
        
        return summary, url
    
    def clear_conversation(self, user_id):
        if user_id in self.conversations:
            del self.conversations[user_id]

ai_handler = AIHandler()
