import logging
import os
import json
import requests
from pathlib import Path
from dotenv import load_dotenv
load_dotenv()

from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    Application, CommandHandler, CallbackQueryHandler, 
    ContextTypes, ConversationHandler, MessageHandler, filters
)
from telegram.constants import ParseMode

from config import BOT_TOKEN, ALTEGIO_URL, data, BOOKING_PARAMS
from ai_handler import ai_handler

logging.basicConfig(format='%(asctime)s - %(name)s - %(levelname)s - %(message)s', level=logging.INFO)
logger = logging.getLogger(__name__)

ADMINS_FILE = Path(__file__).parent / "admins.json"
_admins_cache = None

def get_admins_data():
    global _admins_cache
    if _admins_cache is None:
        with open(ADMINS_FILE, 'r', encoding='utf-8') as f:
            _admins_cache = json.load(f)
    return _admins_cache


def call_gemini(prompt, model="gemini-2.0-flash"):
    api_key = os.getenv("GEMINI_API_KEY", "")
    if not api_key:
        return None
    
    url = f"https://generativelanguage.googleapis.com/v1/models/{model}:generateContent?key={api_key}"
    
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.9,
            "maxOutputTokens": 300
        }
    }
    
    try:
        response = requests.post(url, json=payload, timeout=8)
        if response.status_code == 200:
            data = response.json()
            if "candidates" in data and len(data["candidates"]) > 0:
                return data["candidates"][0]["content"]["parts"][0]["text"]
    except Exception as e:
        pass
    return None


def create_altegio_booking(name, phone, service_id, staff_id, datetime_str):
    api_key = os.getenv("ALTEGIO_API_KEY", "")
    location_id = "766796"
    
    if not api_key:
        return {"success": False, "error": "No API key"}
    
    url = f"https://n816358.alteg.io/api/v2/records/{location_id}"
    
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "client": {
            "name": name,
            "phone": phone
        },
        "staff_id": staff_id,
        "services": [{"id": service_id}],
        "datetime": datetime_str,
        "save_if_busy": True
    }
    
    try:
        response = requests.post(url, json=payload, headers=headers, timeout=15)
        if response.status_code in [200, 201]:
            return {"success": True, "data": response.json()}
        else:
            return {"success": False, "error": response.text}
    except Exception as e:
        return {"success": False, "error": str(e)}
    
    try:
        response = requests.post(url, json=payload, timeout=30)
        if response.status_code == 200:
            data = response.json()
            if "candidates" in data and len(data["candidates"]) > 0:
                return data["candidates"][0]["content"]["parts"][0]["text"]
    except:
        pass
    return None

(CHOOSING_METHOD, CHOOSING_SERVICE, CHOOSING_WORKER, CHOOSING_DATE, CHOOSING_TIME, 
ENTER_NAME, ENTER_PHONE, CONFIRM_BOOKING, AI_CATEGORY, ENTER_SERVICE) = range(10)


def get_main_menu():
    keyboard = [
        [InlineKeyboardButton("🌐 Записатися на сайті", url=ALTEGIO_URL)],
        [InlineKeyboardButton("📝 Записатися через бот", callback_data="start_booking")],
        [InlineKeyboardButton("💆 Послуги та ціни", callback_data="services")],
        [InlineKeyboardButton("👩‍⚕️ Наші спеціалісти", callback_data="staff")],
        [InlineKeyboardButton("⭐ Відгуки", callback_data="reviews")],
        [InlineKeyboardButton("ℹ️ Про нас", callback_data="about")],
        [InlineKeyboardButton("📞 Контакти", callback_data="contact")],
    ]
    return InlineKeyboardMarkup(keyboard)


def get_services_menu():
    keyboard = []
    for i, category in enumerate(data["services"]):
        keyboard.append([InlineKeyboardButton(category["category"], callback_data=f"cat_{i}")])
    keyboard.append([InlineKeyboardButton("🔙 Назад", callback_data="back_main")])
    return InlineKeyboardMarkup(keyboard)


def get_services_for_booking():
    keyboard = []
    for i, category in enumerate(data["services"]):
        for j, item in enumerate(category["items"]):
            keyboard.append([InlineKeyboardButton(
                f"{item['name']} ({item['price']})", 
                callback_data=f"bservice_{i}_{j}"
            )])
    keyboard.append([InlineKeyboardButton("🔙 Скасувати", callback_data="cancel_booking")])
    return InlineKeyboardMarkup(keyboard)


def get_workers_for_booking(selected_service_name):
    keyboard = []
    for i, member in enumerate(data["staff"]):
        keyboard.append([InlineKeyboardButton(
            f"{member['name']} — {member['role']}", 
            callback_data=f"bworker_{i}"
        )])
    keyboard.append([InlineKeyboardButton("🔙 Назад", callback_data="back_to_services")])
    return InlineKeyboardMarkup(keyboard)


def build_booking_url(name, phone, service, worker):
    params = []
    for key, value in BOOKING_PARAMS.items():
        if key == "base":
            continue
        if value == "name":
            params.append(f"{key}={name}")
        elif value == "phone":
            params.append(f"{key}={phone}")
        elif value == "service":
            params.append(f"{key}={service}")
        elif value == "worker":
            params.append(f"{key}={worker}")
    
    param_string = "&".join(params)
    base_url = BOOKING_PARAMS.get("base", ALTEGIO_URL)
    
    if "?" in base_url:
        return f"{base_url}&{param_string}"
    return f"{base_url}?{param_string}"


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    welcome = f"🏠 <b>S Y N E R G Y</b>\n\n✨ {data['welcome']['subtitle']}\n\n{data['welcome']['description']}"
    if update.message:
        await update.message.reply_text(welcome, reply_markup=get_main_menu(), parse_mode=ParseMode.HTML)
    else:
        await update.callback_query.message.edit_text(welcome, reply_markup=get_main_menu(), parse_mode=ParseMode.HTML)


async def start_booking(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    
    context.user_data.clear()
    
    keyboard = [
        [InlineKeyboardButton("🔴 Лазерна Епіляція", callback_data="ai_category_laser")],
        [InlineKeyboardButton("💄 Косметологія", callback_data="ai_category_cosmetology")],
        [InlineKeyboardButton("💆 Масаж", callback_data="ai_category_massage")],
        [InlineKeyboardButton("🌊 Ендосфера", callback_data="ai_category_aquasphera")],
        [InlineKeyboardButton("🔙 На головну", callback_data="back_main")],
    ]
    
    await query.message.edit_text(
        "📅 <b>Запис через бот</b>\n\n"
        "Оберіть категорію послуг:",
        reply_markup=InlineKeyboardMarkup(keyboard),
        parse_mode=ParseMode.HTML
    )
    return AI_CATEGORY


async def choose_service(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    
    _, cat_idx, item_idx = query.data.split("_")
    cat_idx, item_idx = int(cat_idx), int(item_idx)
    
    service = data["services"][cat_idx]["items"][item_idx]
    context.user_data["service"] = service["name"]
    context.user_data["service_price"] = service["price"]
    
    await query.message.edit_text(
        f"✅ <b>{service['name']}</b> — {service['price']}\n\n"
        "Крок 2 з 5\n\n"
        "Оберіть спеціаліста:",
        reply_markup=get_workers_for_booking(service["name"]),
        parse_mode=ParseMode.HTML
    )
    return CHOOSING_WORKER


async def choose_worker(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    
    _, worker_idx = query.data.split("_")
    worker_idx = int(worker_idx)
    
    worker = data["staff"][worker_idx]
    context.user_data["worker"] = worker["name"]
    
    await query.message.edit_text(
        f"👩‍⚕️ <b>{worker['name']}</b>\n"
        f"   {worker['role']}\n\n"
        "Крок 3 з 5\n\n"
        "Введіть ваше <b>ПІБ</b> (повністю):",
        reply_markup=InlineKeyboardMarkup([
            [InlineKeyboardButton("🔙 Назад", callback_data="back_to_services")]
        ]),
        parse_mode=ParseMode.HTML
    )
    return ENTER_NAME


async def enter_name(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data["name"] = update.message.text.strip()
    
    await update.message.reply_text(
        f"✅ <b>{context.user_data['name']}</b>\n\n"
        "Крок 4 з 5\n\n"
        "Введіть ваш <b>номер телефону</b>:",
        reply_markup=InlineKeyboardMarkup([
            [InlineKeyboardButton("🔙 Назад", callback_data="back_to_worker")]
        ]),
        parse_mode=ParseMode.HTML
    )
    return ENTER_PHONE


async def enter_phone(update: Update, context: ContextTypes.DEFAULT_TYPE):
    phone = update.message.text.strip()
    context.user_data["phone"] = phone
    
    await update.message.reply_text(
        f"✅ Телефон: <b>{phone}</b>\n\n"
        "Крок 5 з 5\n\n"
        "Введіть бажану <b>дату та час</b>:\n"
        "Наприклад: «15.03.2026 о 14:00» або «Завтра о 10:00»",
        reply_markup=InlineKeyboardMarkup([
            [InlineKeyboardButton("🔙 Назад", callback_data="back_to_name")]
        ]),
        parse_mode=ParseMode.HTML
    )
    return CHOOSING_TIME


async def choose_time(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data["datetime"] = update.message.text.strip()
    
    booking_url = build_booking_url(
        context.user_data["name"],
        context.user_data["phone"],
        context.user_data["service"],
        context.user_data["worker"]
    )
    
    summary = (
        "📋 <b>Ваш запит на запис:</b>\n\n"
        f"👤 <b>{context.user_data['name']}</b>\n"
        f"📱 {context.user_data['phone']}\n"
        f"💆 {context.user_data['service']} ({context.user_data['service_price']})\n"
        f"👩‍⚕️ {context.user_data['worker']}\n"
        f"🕐 {context.user_data['datetime']}\n\n"
        "Натисніть кнопку нижче, щоб завершити запис на сайті:"
    )
    
    await update.message.reply_text(
        summary,
        reply_markup=InlineKeyboardMarkup([
            [InlineKeyboardButton("🌐 Перейти до запису", url=booking_url)],
            [InlineKeyboardButton("🔄 Змінити дані", callback_data="start_booking")],
            [InlineKeyboardButton("🏠 Головне меню", callback_data="back_main")]
        ]),
        parse_mode=ParseMode.HTML
    )
    
    context.user_data.clear()
    return ConversationHandler.END


async def booking_back_to_services(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    
    await query.message.edit_text(
        "📅 <b>Запис через бот</b>\n\n"
        "Крок 1 з 5\n\n"
        "Оберіть послугу:",
        reply_markup=get_services_for_booking(),
        parse_mode=ParseMode.HTML
    )
    return CHOOSING_SERVICE


async def ai_category_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    
    parts = query.data.split("_")
    category = parts[-1]
    user_id = query.from_user.id
    
    question = ai_handler.start_booking(user_id, category)
    context.user_data["ai_category"] = category
    context.user_data["ai_step"] = "first_question"
    
    if category == "laser":
        keyboard = [
            [InlineKeyboardButton("👩 Жінка", callback_data="ai_gender_woman")],
            [InlineKeyboardButton("👨 Чоловік", callback_data="ai_gender_man")],
            [InlineKeyboardButton("🔙 Назад", callback_data="start_booking")],
        ]
        
        await query.message.edit_text(
            "💆 <b>Лазерна Епіляція</b>\n\nВиберіть стать:",
            reply_markup=InlineKeyboardMarkup(keyboard),
            parse_mode=ParseMode.HTML
        )
    else:
        keyboard = [
            [InlineKeyboardButton("✅ Так", callback_data="ai_yes")],
            [InlineKeyboardButton("❌ Ні", callback_data="ai_no")],
            [InlineKeyboardButton("🔙 Назад", callback_data="start_booking")],
        ]
        
        await query.message.edit_text(
            f"💆 <b>{category.upper()}</b>\n\n{question}",
            reply_markup=InlineKeyboardMarkup(keyboard),
            parse_mode=ParseMode.HTML
        )
    return ENTER_NAME


async def ai_back_to_first_question(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    
    category = context.user_data.get("ai_category", "laser")
    
    admins_data = get_admins_data()
    question = admins_data["categories"][category]["first_time_question"]
    
    keyboard = [
        [InlineKeyboardButton("✅ Так", callback_data="ai_yes")],
        [InlineKeyboardButton("❌ Ні", callback_data="ai_no")],
        [InlineKeyboardButton("🔙 Назад", callback_data="start_booking")],
    ]
    
    await query.message.edit_text(
        f"💆 <b>{category.upper()}</b>\n\n{question}",
        reply_markup=InlineKeyboardMarkup(keyboard),
        parse_mode=ParseMode.HTML
    )


async def ai_yes_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    
    category = context.user_data.get("ai_category", "laser")
    
    if category == "laser":
        keyboard = [
            [InlineKeyboardButton("👩 Жінка", callback_data="ai_gender_woman")],
            [InlineKeyboardButton("👨 Чоловік", callback_data="ai_gender_man")],
            [InlineKeyboardButton("🔙 Назад", callback_data="ai_back_first_q")],
        ]
        
        await query.message.edit_text(
            "Виберіть стать:",
            reply_markup=InlineKeyboardMarkup(keyboard),
            parse_mode=ParseMode.HTML
        )
    else:
        context.user_data["ai_step"] = "ask_goals"
        
        category_info = {
            "cosmetology": "Чудово! Розкажіть, які проблеми з шкірою вас турбують? Наприклад, акне, пігментація, зморшки, сухість тощо.",
            "massage": "Чудово! Розкажіть, що вас турбує? Біль у спині, набряки, целюліт, або просто хочете відпочити?",
            "aquasphera": "Чудово! Розкажіть, який результат ви хочете отримати? Зменшення целюліту, схуднення, або позбутись набряків?"
        }
        
        await query.message.edit_text(
            f"<b>{category.upper()}</b>\n\n{category_info.get(category, 'Чудово! Розкажіть, чим можу допомогти?')}",
            parse_mode=ParseMode.HTML
        )
        return ENTER_NAME


async def ai_back_to_gender(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    
    keyboard = [
        [InlineKeyboardButton("👩 Жінка", callback_data="ai_gender_woman")],
        [InlineKeyboardButton("👨 Чоловік", callback_data="ai_gender_man")],
        [InlineKeyboardButton("🔙 Назад", callback_data="start_booking")],
    ]
    
    await query.message.edit_text(
        "💆 <b>Лазерна Епіляція</b>\n\nВиберіть стать:",
        reply_markup=InlineKeyboardMarkup(keyboard),
        parse_mode=ParseMode.HTML
    )


async def ai_gender_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    
    parts = query.data.split("_")
    gender = parts[-1]
    context.user_data["ai_gender"] = gender
    context.user_data["ai_step"] = "laser_experience"
    
    await query.message.edit_text(
        "💆 <b>Лазерна Епіляція</b>\n\n"
        "Чудово! Допоможу вам із записом.\n\n"
        "Скажіть, ви колись робили лазерну епіляцію?",
        parse_mode=ParseMode.HTML
    )
    return ENTER_NAME


async def ai_enter_service(update: Update, context: ContextTypes.DEFAULT_TYPE):
    service_input = update.message.text.strip().lower()
    category = context.user_data.get("ai_category", "laser")
    gender = context.user_data.get("ai_gender", "woman")
    
    if category == "laser":
        service_key = f"laser_{gender}"
    else:
        service_key = category
    
    admins_data = get_admins_data()
    services = admins_data["services"].get(service_key, [])
    
    found_services = []
    for i, service in enumerate(services):
        service_name = service["name"].lower()
        words = service_input.split()
        for word in words:
            if len(word) > 2 and word in service_name:
                found_services.append({"index": i, **service})
                break
    
    if found_services:
        context.user_data["service_index"] = found_services[0]["index"]
        context.user_data["selected_service"] = found_services[0]["name"]
        
        if len(found_services) == 1:
            await update.message.reply_text(
                f"✅ <b>Знайдено:</b>\n\n"
                f"Послуга: <b>{found_services[0]['name']}</b>\n"
                f"Час: {found_services[0]['time']}\n"
                f"Ціна: {found_services[0]['price']}\n\n"
                "Введіть ваше <b>ПІБ</b> (повністю):",
                parse_mode=ParseMode.HTML
            )
        else:
            keyboard = []
            for s in found_services[:10]:
                keyboard.append([InlineKeyboardButton(
                    f"{s['name']} - {s['price']}",
                    callback_data=f"ai_select_service_{s['index']}"
                )])
            
            await update.message.reply_text(
                f"✅ Знайдено {len(found_services)} послуг. Оберіть одну:",
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode=ParseMode.HTML
            )
        return ENTER_NAME
    else:
        service_list = "\n".join([f"• {s['name']}" for s in services[:15]])
        await update.message.reply_text(
            f"❌ Послугу не знайдено.\n\n"
            f"Ось доступні послуги:\n{service_list}\n\n"
            "Напишіть назву з списку вище:",
            parse_mode=ParseMode.HTML
        )
        return ENTER_SERVICE


async def ai_no_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    
    category = context.user_data.get("ai_category", "laser")
    context.user_data["ai_step"] = "explanation"
    
    admins_data = get_admins_data()
    explanation_key = admins_data["categories"][category]["first_time_explanation"]
    explanation = admins_data["explanations"].get(explanation_key, "Інформація готується...")
    
    keyboard = [
        [InlineKeyboardButton("Продовжити", callback_data="ai_continue")],
        [InlineKeyboardButton("На головну", callback_data="back_main")],
    ]
    
    await query.message.edit_text(
        f"📝 <b>Що таке {explanation_key}?</b>\n\n{explanation}",
        reply_markup=InlineKeyboardMarkup(keyboard),
        parse_mode=ParseMode.HTML
    )


async def ai_select_service_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    
    _, _, service_idx = query.data.split("_")
    service_index = int(service_idx)
    
    gender = context.user_data.get("ai_gender", "woman")
    service_key = f"laser_{gender}"
    
    admins_data = get_admins_data()
    services = admins_data["services"].get(service_key, [])
    service = services[service_index]
    
    context.user_data["service_index"] = service_index
    context.user_data["selected_service"] = service["name"]
    
    await query.message.edit_text(
        f"✅ <b>Обрано:</b>\n\n"
        f"Послуга: <b>{service['name']}</b>\n"
        f"Час: {service['time']}\n"
        f"Ціна: {service['price']}\n\n"
        "Введіть ваше <b>ПІБ</b> (повністю):",
        parse_mode=ParseMode.HTML
    )


async def ai_continue_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    
    category = context.user_data.get("ai_category", "laser")
    
    if category == "laser":
        keyboard = [
            [InlineKeyboardButton("👩 Жінка", callback_data="ai_gender_woman")],
            [InlineKeyboardButton("👨 Чоловік", callback_data="ai_gender_man")],
            [InlineKeyboardButton("🔙 Назад", callback_data="ai_back_first_q")],
        ]
        
        await query.message.edit_text(
            "Виберіть стать:",
            reply_markup=InlineKeyboardMarkup(keyboard),
            parse_mode=ParseMode.HTML
        )
    else:
        context.user_data["ai_step"] = "choose_service"
        services = ai_handler.get_services_buttons(category)
        
        await query.message.edit_text(
            "Оберіть послугу:",
            reply_markup=services,
            parse_mode=ParseMode.HTML
        )


async def ai_for_self_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    
    context.user_data["ai_step"] = "laser_type"
    context.user_data["for_self"] = True
    
    await query.message.edit_text(
        "Чудово! Скажіть, ви робили на <b>Олександритовому лазері</b> чи це ваш перший досвід?",
        parse_mode=ParseMode.HTML
    )


async def ai_for_gift_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    
    context.user_data["ai_step"] = "laser_type"
    context.user_data["for_self"] = False
    
    await query.message.edit_text(
        "Чудово! Скажіть, ви робили на <b>Олександритовому лазері</b> чи це ваш перший досвід?",
        parse_mode=ParseMode.HTML
    )


async def ai_no_questions_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    
    service_data = context.user_data.get("selected_service_data", {})
    context.user_data["ai_step"] = "enter_name"
    
    await query.message.edit_text(
        f"✅ <b>Підтвердження:</b>\n\n"
        f"Послуга: <b>{service_data.get('name', '')}</b>\n"
        f"Час: {service_data.get('time', '')}\n"
        f"Ціна: {service_data.get('price', '')}\n\n"
        "Введіть ваше <b>ПІБ</b> (повністю):",
        parse_mode=ParseMode.HTML
    )
    return ENTER_NAME


async def ai_continue_to_services_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    
    context.user_data["ai_step"] = "enter_service"
    
    await query.message.edit_text(
        "На які ділянки бажаєте запланувати візит?\n\n"
        "<i>Ви також можете запитати будь-які питання про студію</i>",
        parse_mode=ParseMode.HTML
    )


async def ai_service_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    
    _, _, category, idx = query.data.split("_")
    service_index = int(idx)
    context.user_data["ai_category"] = category
    context.user_data["service_index"] = service_index
    
    admins_data = get_admins_data()
    services = admins_data["services"].get(category, [])
    if service_index < len(services):
        service = services[service_index]
        if service.get("unavailable"):
            await query.message.edit_text(
                f"⚠️ <b>Послуга тимчасово недоступна</b>\n\n"
                f"Послуга «{service['name']}» наразі недоступна.\n"
                "Будь ласка, оберіть іншу послугу.",
                reply_markup=InlineKeyboardMarkup([
                    [InlineKeyboardButton("🔙 Назад", callback_data="ai_back_first_q")]
                ]),
                parse_mode=ParseMode.HTML
            )
            return
    
    context.user_data["ai_step"] = "choose_worker"
    workers = ai_handler.get_workers_buttons(category)
    
    await query.message.edit_text(
        "Оберіть спеціаліста:",
        reply_markup=workers,
        parse_mode=ParseMode.HTML
    )


async def ai_worker_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    
    _, worker_id = query.data.split("_")
    context.user_data["worker_id"] = worker_id
    context.user_data["ai_step"] = "enter_name"
    
    await query.message.edit_text(
        "Введіть ваше <b>ПІБ</b> (повністю):",
        parse_mode=ParseMode.HTML
    )
    return ENTER_NAME


async def ai_enter_name(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_message = update.message.text.strip()
    ai_step = context.user_data.get("ai_step", "")
    user_id = update.message.from_user.id
    
    if ai_step == "ask_goals":
        category = context.user_data.get("ai_category", "cosmetology")
        
        ai_prompt = f"""Ти - дружній адміністратор салону краси SYNERGY у Львові.
Користувач цікавиться послугами: {category}
Проблема/питання користувача: {user_message}
Дай коротку, корисну відповідь українською мовою. Після відповіді запропонуй перейти до вибору послуг."""
        
        ai_response = call_gemini(ai_prompt)
        
        if not ai_response:
            ai_responses = {
                "cosmetology": "Чудово, що звернулися! Наш косметолог Ілона допоможе вам підібрати ідеальну процедуру для вашого типу шкіри.",
                "massage": "Чудово, що звернулися! Наш масажист Владислав підбере найкращу техніку для ваших потреб.",
                "aquasphera": "Чудово, що звернулися! Ендосфера терапія - відмінний вибір для корекції фігури!"
            }
            ai_response = ai_responses.get(category, "Чудово! Наш спеціаліст допоможе вам!")
        
        context.user_data["ai_step"] = "choose_service"
        services = ai_handler.get_services_buttons(category)
        
        await update.message.reply_text(
            f"{ai_response}\n\nОберіть послугу:",
            reply_markup=services,
            parse_mode=ParseMode.HTML
        )
        return ENTER_NAME
    
    if ai_step == "laser_experience":
        lower_msg = user_message.lower()
        
        if "так" in lower_msg or "yes" in lower_msg or "робила" in lower_msg or "робив" in lower_msg:
            context.user_data["ai_step"] = "for_self_or_gift"
            
            keyboard = [
                [InlineKeyboardButton("Для себе", callback_data="ai_for_self")],
                [InlineKeyboardButton("В подарунок", callback_data="ai_for_gift")],
            ]
            
            await update.message.reply_text(
                "Підкажіть, ви для себе обираєте чи в подарунок?",
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode=ParseMode.HTML
            )
            return ENTER_NAME
        else:
            context.user_data["ai_step"] = "first_time_explained"
            
            ai_prompt = """Користувач вперше цікавиться лазерною епіляцією.
Розкажи коротко що таке лазерна епіляція, як вона працює, чому олександритовий лазер DEKA Moveo кращий за інші.
Відповідай українською мовою, дружньо."""
            ai_response = call_gemini(ai_prompt)
            
            if not ai_response:
                ai_response = "Лазерна епіляція - це ефективний спосіб позбутися небажаного волосся надовго. Наш олександритовий лазер DEKA Moveo працює швидко, безболісно та підходить для всіх типів шкіри."
            
            keyboard = [
                [InlineKeyboardButton("Продовжити", callback_data="ai_continue_to_services")],
                [InlineKeyboardButton("На головну", callback_data="back_main")],
            ]
            
            await update.message.reply_text(
                f"{ai_response}\n\n"
                "Бажаєте продовжити запис?",
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode=ParseMode.HTML
            )
            return ENTER_NAME
    
    elif ai_step == "for_self" or ai_step == "for_gift":
        context.user_data["ai_step"] = "laser_type"
        
        await update.message.reply_text(
            "Чудово! Скажіть, ви робили на <b>Олександритовому лазері</b> чи це ваш перший досвід?",
            parse_mode=ParseMode.HTML
        )
        return ENTER_NAME
    
    elif ai_step == "laser_type":
        lower_msg = user_message.lower()
        
        if "діод" in lower_msg or "діодн" in lower_msg:
            context.user_data["ai_step"] = "laser_explained"
            
            ai_prompt = """Користувач робив лазерну епіляцію на діодному лазері, але результат був неповним.
Поясни коротко чому олександритовий лазер DEKA Moveo краще.
Відповідай українською мовою."""
            
            ai_response = call_gemini(ai_prompt)
            
            if not ai_response:
                ai_response = "Ми працюємо на олександритовому італійському лазері DEKA Moveo!"
            
            keyboard = [
                [InlineKeyboardButton("Продовжити", callback_data="ai_continue_to_services")],
                [InlineKeyboardButton("На головну", callback_data="back_main")],
            ]
            
            await update.message.reply_text(
                f"Дякую! {ai_response}\n\n"
                "Бажаєте продовжити запис?",
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode=ParseMode.HTML
            )
            return ENTER_NAME
        else:
            context.user_data["ai_step"] = "enter_service"
            
            keyboard = [
                [InlineKeyboardButton("Продовжити", callback_data="ai_continue_to_services")],
                [InlineKeyboardButton("На головну", callback_data="back_main")],
            ]
            
            await update.message.reply_text(
                "Чудово! Напишіть, які ділянки ви хочете епілювати:\n"
                "Наприклад: ноги, пахви, бікіні, руки тощо",
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode=ParseMode.HTML
            )
            return ENTER_NAME
    
    elif ai_step == "laser_explained":
        context.user_data["ai_step"] = "enter_service"
        
        keyboard = [
            [InlineKeyboardButton("Продовжити", callback_data="ai_continue_to_services")],
            [InlineKeyboardButton("На головну", callback_data="back_main")],
        ]
        
        await update.message.reply_text(
            "На які ділянки ви хочете запланувати візит?\n"
            "Наприклад: ноги, пахви, бікіні, руки тощо",
            reply_markup=InlineKeyboardMarkup(keyboard),
            parse_mode=ParseMode.HTML
        )
        return ENTER_NAME
    
    elif ai_step == "first_time_explained" or ai_step == "asked_about_diode" or ai_step == "enter_service":
        user_message_original = update.message.text.strip()
        gender = context.user_data.get("ai_gender", "woman")
        
        service_input = user_message_original.lower()
        service_key = f"laser_{gender}"
        
        studio_keywords = ["студія", "синержі", "synergy", "львів", "lviv", "адреса", "контакт", "ціна", "вартість", "записати", "послуги", "спеціаліст", "олена", "меланія", "марія"]
        is_studio_question = any(kw in service_input for kw in studio_keywords)
        
        if is_studio_question:
            studio_prompt = f"""Ти - адміністратор салону краси SYNERGY у Львові.
Відповідай на питання українською мовою коротко.
Послуги: Лазерна епіляція (Олена), Косметологія (Меланія), Масаж (Марія).
Питання: {user_message_original}"""
            
            ai_response = call_gemini(studio_prompt)
            
            if not ai_response:
                ai_response = "Для детальної інформації зв'яжіться з нами!"
            
            await update.message.reply_text(
                f"{ai_response}\n\n"
                "На які ділянки бажаєте запланувати візит?\n"
                "<i>Ви також можете запитати будь-які питання про студію</i>",
                parse_mode=ParseMode.HTML
            )
            return ENTER_NAME
        
    admins_data = get_admins_data()
    services = admins_data["services"].get(service_key, [])
        
        found_services = []
        for i, service in enumerate(services):
            service_name = service["name"].lower()
            words = service_input.split()
            for word in words:
                if len(word) > 2 and word in service_name:
                    found_services.append({"index": i, **service})
                    break
        
        if found_services:
            context.user_data["service_index"] = found_services[0]["index"]
            context.user_data["selected_service"] = found_services[0]["name"]
            context.user_data["selected_service_data"] = found_services[0]
            context.user_data["ai_step"] = "ask_questions"
            
            keyboard = [
                [InlineKeyboardButton("Продовжити", callback_data="ai_no_questions")],
            ]
            
            await update.message.reply_text(
                f"✅ <b>Знайдено:</b>\n\n"
                f"Послуга: <b>{found_services[0]['name']}</b>\n"
                f"Час: {found_services[0]['time']}\n"
                f"Ціна: {found_services[0]['price']}\n\n"
                "<i>Чи є у вас якісь питання щодо лазерної епіляції?</i>\n\n"
                "Натисніть 'Продовжити' щоб рухатись далі, або напишіть своє питання.",
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode=ParseMode.HTML
            )
            return ENTER_NAME
        else:
            service_list = "\n".join([f"• {s['name']}" for s in services[:15]])
            await update.message.reply_text(
                f"❌ Послугу не знайдено.\n\n"
                f"Ось доступні послуги:\n{service_list}\n\n"
                "Напишіть назву з списку вище:",
                parse_mode=ParseMode.HTML
            )
            return ENTER_NAME
    
    if ai_step == "ask_questions":
        lower_msg = user_message.lower()
        
        if "продовж" in lower_msg or "далі" in lower_msg or "continue" in lower_msg or "да" in lower_msg:
            service_data = context.user_data.get("selected_service_data", {})
            
            await update.message.reply_text(
                f"✅ <b>Підтвердження:</b>\n\n"
                f"Послуга: <b>{service_data.get('name', '')}</b>\n"
                f"Час: {service_data.get('time', '')}\n"
                f"Ціна: {service_data.get('price', '')}\n\n"
                "Введіть ваше <b>ПІБ</b> (повністю):",
                parse_mode=ParseMode.HTML
            )
            return ENTER_NAME
        else:
            ai_prompt = f"""Ти - дружній адміністратор салону краси SYNERGY у Львові.
Відповідай українською мовою коротко.
Питання: {user_message}"""
            
            ai_response = call_gemini(ai_prompt)
            
            if not ai_response:
                lower_q = user_message.lower()
                laser_responses = {
                    "біль": "Наш лазер DEKA Moveo має вбудовану систему охолодження, тому процедура максимально комфортна!",
                    "кількість": "Для стійкого результату потрібно 6-10 процедур, залежить від індивідуальних особливостей.",
                    "підготовка": "Перед процедурою: не засмагати 2 тижні, не використовувати пінцет/віск за місяць.",
                    "протипоказан": "Протипоказання: вагітність, онкологія, діабет, запалення шкіри в зоні.",
                    "ріст": "Після курсу процедур волосся стає значно рідшим і тоншим.",
                    "перший": "Перші результати помітні вже після 1-2 процедур!",
                    "ціна": "Ціни залежать від зони: пахви - від 640 грн, бікіні - від 600 грн, ноги повні - від 990 грн.",
                    "ефект": "Ефект після курсу зберігається роками!",
                    "default": "Для детальної інформації запишіться на консультацію, і наш спеціаліст все розповість!"
                }
                ai_response = laser_responses["default"]
                for key, value in laser_responses.items():
                    if key in lower_q:
                        ai_response = value
                        break
            
            keyboard = [
                [InlineKeyboardButton("Продовжити", callback_data="ai_no_questions")],
            ]
            
            await update.message.reply_text(
                f"{ai_response}\n\n"
                "<i>Чи є ще питання?</i>\n\n"
                "Натисніть 'Продовжити' щоб рухатись далі.",
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode=ParseMode.HTML
            )
            return ENTER_NAME
    
    else:
        name = user_message
        context.user_data["name"] = name
        context.user_data["ai_step"] = "enter_phone"
        
        await update.message.reply_text(
            f"✅ <b>{name}</b>\n\n"
            "Введіть ваш <b>номер телефону</b>:",
            parse_mode=ParseMode.HTML
        )
        return ENTER_PHONE


async def ai_enter_phone(update: Update, context: ContextTypes.DEFAULT_TYPE):
    phone = update.message.text.strip()
    context.user_data["phone"] = phone
    context.user_data["ai_step"] = "enter_datetime"
    
    await update.message.reply_text(
        f"✅ <b>{phone}</b>\n\n"
        "Введіть зручну <b>дату та час</b>:\n"
        "Наприклад: 15.04.2026 о 14:00",
        parse_mode=ParseMode.HTML
    )
    return CHOOSING_TIME


async def ai_enter_datetime(update: Update, context: ContextTypes.DEFAULT_TYPE):
    datetime = update.message.text.strip()
    context.user_data["datetime"] = datetime
    
    admins_data = get_admins_data()
    category = context.user_data.get("ai_category", "laser")
    gender = context.user_data.get("ai_gender", "woman")
    worker_id = int(context.user_data.get("worker_id", 1))
    
    workers = admins_data["categories"][category]["workers"]
    worker = next((w for w in workers if w["id"] == worker_id), workers[0])
    
    if category == "laser":
        service_key = f"laser_{gender}"
    else:
        service_key = category
    
    services = admins_data["services"].get(service_key, [])
    service_idx = context.user_data.get("service_index", 0)
    service = services[service_idx] if services else {"name": "Консультація", "price": "0"}
    
    context.user_data["alteg_url"] = admins_data["altegio_url"]
    
    summary = (
        f"📋 <b>Перевірте ваші дані:</b>\n\n"
        f"👤 Ім'я: <b>{context.user_data['name']}</b>\n"
        f"📱 Телефон: <b>{context.user_data['phone']}</b>\n"
        f"💆 Послуга: <b>{service['name']}</b>\n"
        f"👩‍⚕️ Спеціаліст: <b>{worker['name']}</b>\n"
        f"🕐 Дата/час: <b>{datetime}</b>\n\n"
        "Все вірно?"
    )
    
    await update.message.reply_text(
        summary,
        reply_markup=InlineKeyboardMarkup([
            [InlineKeyboardButton("✅ Підтвердити", callback_data="ai_confirm_booking")],
            [InlineKeyboardButton("❌ Відмінити", callback_data="back_main")]
        ]),
        parse_mode=ParseMode.HTML
    )


async def ai_confirm_booking_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    
    name = context.user_data.get("name", "")
    phone = context.user_data.get("phone", "")
    datetime_str = context.user_data.get("datetime", "")
    service_index = context.user_data.get("service_index", 0)
    worker_id = context.user_data.get("worker_id", 1)
    category = context.user_data.get("ai_category", "laser")
    
    admins_data = get_admins_data()
    workers = admins_data["categories"][category]["workers"]
    worker = next((w for w in workers if w["id"] == worker_id), workers[0])
    staff_id = worker.get("altegio_staff_id", 1)
    
    service_key = f"laser_{context.user_data.get('ai_gender', 'woman')}"
    if category != "laser":
        service_key = category
    
    services = admins_data["services"].get(service_key, [])
    service = services[service_index] if services and service_index < len(services) else {"name": "Консультація", "altegio_id": 123456}
    
    service_id = service.get("altegio_id", 123456)
    
    result = create_altegio_booking(name, phone, service_id, staff_id, datetime_str)
    
    if result.get("success"):
        await query.message.edit_text(
            "✅ <b>Запис успішно створено!</b>\n\n"
            f"👤 {name}\n"
            f"📱 {phone}\n"
            f"💆 {service.get('name', 'Послуга')}\n"
            f"🕐 {datetime_str}\n\n"
            "Ми чекаємо на вас у студії SYNERGY!\n"
            "Для зміни запису зв'яжіться з нами.",
            reply_markup=InlineKeyboardMarkup([
                [InlineKeyboardButton("🏠 Головне меню", callback_data="back_main")]
            ]),
            parse_mode=ParseMode.HTML
        )
    else:
        error_msg = result.get("error", "Помилка запису")
        await query.message.edit_text(
            f"⚠️ <b>Помилка запису</b>\n\n"
            f"Помилка: {error_msg}\n\n"
            "Будь ласка, зв'яжіться з нами для запису:",
            reply_markup=InlineKeyboardMarkup([
                [InlineKeyboardButton("📞 Зателефонувати", url="https://t.me/synergy_lviv")],
                [InlineKeyboardButton("🏠 Головне меню", callback_data="back_main")]
            ]),
            parse_mode=ParseMode.HTML
        )


async def booking_back_to_worker(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    
    await query.message.edit_text(
        f"👩‍⚕️ Оберіть спеціаліста:\n\n"
        "Крок 2 з 5",
        reply_markup=get_workers_for_booking(context.user_data.get("service", "")),
        parse_mode=ParseMode.HTML
    )
    return CHOOSING_WORKER


async def booking_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    
    context.user_data.clear()
    
    welcome = f"🏠 <b>S Y N E R G Y</b>\n\n✨ {data['welcome']['subtitle']}\n\n{data['welcome']['description']}"
    await query.message.edit_text(welcome, reply_markup=get_main_menu(), parse_mode=ParseMode.HTML)
    return ConversationHandler.END


def booking_conv_handler():
    return ConversationHandler(
        entry_points=[],
        states={
            CHOOSING_SERVICE: [
                CallbackQueryHandler(choose_service, pattern="^bservice_"),
                CallbackQueryHandler(booking_cancel, pattern="^cancel_booking$"),
            ],
            CHOOSING_WORKER: [
                CallbackQueryHandler(choose_worker, pattern="^bworker_"),
                CallbackQueryHandler(booking_back_to_services, pattern="^back_to_services$"),
            ],
            ENTER_NAME: [
                MessageHandler(filters.TEXT & ~filters.COMMAND, enter_name),
                CallbackQueryHandler(booking_back_to_worker, pattern="^back_to_worker$"),
            ],
            ENTER_PHONE: [
                MessageHandler(filters.TEXT & ~filters.COMMAND, enter_phone),
                CallbackQueryHandler(booking_name_back, pattern="^back_to_name$"),
            ],
            CHOOSING_TIME: [
                MessageHandler(filters.TEXT & ~filters.COMMAND, choose_time),
                CallbackQueryHandler(booking_phone_back, pattern="^back_to_phone$"),
            ],
        },
        fallbacks=[
            CallbackQueryHandler(booking_cancel, pattern="^cancel_booking$"),
        ],
    )


async def booking_name_back(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    
    await query.message.edit_text(
        f"👩‍⚕️ <b>{context.user_data.get('worker', 'Спеціаліст')}</b>\n\n"
        "Крок 3 з 5\n\n"
        "Введіть ваше <b>ПІБ</b> (повністю):",
        reply_markup=InlineKeyboardMarkup([
            [InlineKeyboardButton("🔙 Назад", callback_data="back_to_services")]
        ]),
        parse_mode=ParseMode.HTML
    )
    return ENTER_NAME


async def booking_phone_back(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    
    await query.message.edit_text(
        f"✅ <b>{context.user_data.get('name', '')}</b>\n\n"
        "Крок 4 з 5\n\n"
        "Введіть ваш <b>номер телефону</b>:",
        reply_markup=InlineKeyboardMarkup([
            [InlineKeyboardButton("🔙 Назад", callback_data="back_to_name")]
        ]),
        parse_mode=ParseMode.HTML
    )
    return ENTER_PHONE


async def button_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    
    if query.data == "services":
        await query.message.edit_text(
            "💆 <b>Послуги та ціни</b>\n\nОберіть категорію:",
            reply_markup=get_services_menu(),
            parse_mode='HTML'
        )
    elif query.data.startswith("cat_"):
        cat_index = int(query.data.split("_")[1])
        category = data["services"][cat_index]
        text = f"<b>{category['category']}</b>\n\n"
        for item in category["items"]:
            text += f"▫️ <b>{item['name']}</b>\n"
            text += f"   ⏱ {item['duration']}  |  💰 {item['price']}\n\n"
        text += "📅 Для запису натисніть /book"
        
        await query.message.edit_text(
            text,
            reply_markup=get_services_menu(),
            parse_mode='HTML'
        )
    
    elif query.data == "staff":
        text = "👩‍⚕️ <b>Наші спеціалісти</b>\n\n"
        for member in data["staff"]:
            text += f"👤 <b>{member['name']}</b>\n"
            text += f"   🎓 {member['role']}\n"
            text += f"   ✨ {member['specialty']}\n\n"
        
        await query.message.edit_text(
            text,
            reply_markup=InlineKeyboardMarkup([
                [InlineKeyboardButton("🔙 Назад", callback_data="back_main")]
            ]),
            parse_mode='HTML'
        )
    
    elif query.data == "reviews":
        text = "⭐ <b>Відгуки наших клієнтів</b>\n\n"
        for review in data["reviews"]:
            text += f"💬 <b>{review['name']}</b> — {review['service']}\n"
            text += f"   «{review['text']}»\n\n"
        
        await query.message.edit_text(
            text,
            reply_markup=InlineKeyboardMarkup([
                [InlineKeyboardButton("🔙 Назад", callback_data="back_main")]
            ]),
            parse_mode='HTML'
        )
    
    elif query.data == "about":
        await query.message.edit_text(
            f"ℹ️ <b>Про SYNERGY</b>\n\n{data['welcome']['about']}",
            reply_markup=InlineKeyboardMarkup([
                [InlineKeyboardButton("🔙 Назад", callback_data="back_main")]
            ]),
            parse_mode='HTML'
        )
    
    elif query.data == "contact":
        contact = data["contact"]
        text = (
            f"📞 <b>Контакти</b>\n\n"
            f"📱 Телефон: {contact['phone']}\n"
            f"📍 Адреса: {contact['location']}\n"
            f"📸 Instagram: {contact['instagram']}\n"
            f"🕐 Графік: {contact['working_hours']}"
        )
        await query.message.edit_text(
            text,
            reply_markup=InlineKeyboardMarkup([
                [InlineKeyboardButton("🔙 Назад", callback_data="back_main")]
            ]),
            parse_mode='HTML'
        )
    
    elif query.data == "back_main":
        welcome = f"🏠 <b>S Y N E R G Y</b>\n\n✨ {data['welcome']['subtitle']}\n\n{data['welcome']['description']}"
        await query.message.edit_text(welcome, reply_markup=get_main_menu(), parse_mode='HTML')


async def book_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "📅 <b>Запис на прийом</b>\n\n"
        "Натисніть кнопку нижче, щоб обрати зручний час та записатися:\n\n"
        f"👉 <a href='{ALTEGIO_URL}'>Перейти до запису</a>",
        parse_mode='HTML'
    )


async def ai_button_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    data = query.data
    
    if not data.startswith("ai_"):
        return
    
    if data == "ai_yes":
        await ai_yes_handler(update, context)
    elif data == "ai_no":
        await ai_no_handler(update, context)
    elif data == "ai_continue":
        await ai_continue_handler(update, context)
    elif data == "ai_back_first_q":
        await ai_back_to_first_question(update, context)
    elif data.startswith("ai_gender_"):
        await ai_gender_handler(update, context)
    elif data == "ai_back_to_gender":
        await ai_back_to_gender(update, context)
    elif data.startswith("ai_select_service_"):
        await ai_select_service_handler(update, context)
    elif data.startswith("ai_service_"):
        await ai_service_handler(update, context)
    elif data.startswith("ai_worker_"):
        await ai_worker_handler(update, context)
    elif data == "ai_continue_to_services":
        await ai_continue_to_services_handler(update, context)
    elif data == "ai_for_self":
        await ai_for_self_handler(update, context)
    elif data == "ai_for_gift":
        await ai_for_gift_handler(update, context)
    elif data == "ai_confirm_booking":
        await ai_confirm_booking_handler(update, context)



def main():
    app = Application.builder().token(BOT_TOKEN).build()
    
    async def error_handler(update, context):
        logger.error(f"Error: {context.error}")
        if update and update.callback_query:
            try:
                await update.callback_query.message.reply_text(
                    "⚠️ Виникла помилка. Спробуйте ще раз або натисніть /start",
                    parse_mode='HTML'
                )
            except:
                pass
    
    app.add_error_handler(error_handler)
    
    ai_conv_handler = ConversationHandler(
        entry_points=[
            CallbackQueryHandler(start_booking, pattern="^start_booking$"),
        ],
        states={
            AI_CATEGORY: [
                CallbackQueryHandler(ai_category_handler, pattern="^ai_category_"),
                CallbackQueryHandler(ai_yes_handler, pattern="^ai_yes$"),
                CallbackQueryHandler(ai_no_handler, pattern="^ai_no$"),
            ],
            ENTER_SERVICE: [
                MessageHandler(filters.TEXT & ~filters.COMMAND, ai_enter_service),
            ],
            ENTER_NAME: [
                MessageHandler(filters.TEXT & ~filters.COMMAND, ai_enter_name),
                CallbackQueryHandler(ai_gender_handler, pattern="^ai_gender_"),
                CallbackQueryHandler(ai_no_questions_handler, pattern="^ai_no_questions$"),
            ],
            ENTER_PHONE: [
                MessageHandler(filters.TEXT & ~filters.COMMAND, ai_enter_phone),
            ],
            CHOOSING_TIME: [
                MessageHandler(filters.TEXT & ~filters.COMMAND, ai_enter_datetime),
            ],
        },
        fallbacks=[
            CallbackQueryHandler(booking_cancel, pattern="^cancel_booking$"),
        ],
    )
    
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("book", book_command))
    app.add_handler(booking_conv_handler())
    app.add_handler(ai_conv_handler)
    app.add_handler(CallbackQueryHandler(button_handler))
    app.add_handler(CallbackQueryHandler(ai_button_handler))
    
    print("SYNERGY Bot started!")
    app.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
