# SYNERGY Telegram Bot

Телеграм-бот для студії краси та здоров'я SYNERGY!

## Функції
- 📅 Запис через Altegio
- 💆 Послуги та ціни
- 👩‍⚕️ Каталог спеціалістів
- ⭐ Відгуки клієнтів
- 📝 Залишення даних (coming soon)
- ℹ️ Інформація про студію

## Встановлення

```bash
pip install -r requirements.txt
python bot.py
```

## Команди
- `/start` - Головне меню
- `/book` - Швидкий запис

## Налаштування
Відредагуйте `.env` файл:
```
BOT_TOKEN=your_telegram_bot_token
ALTEGIO_BOOKING_URL=your_altegio_link
```

## Структура файлів
```
├── bot.py          # Основний код бота
├── config.py       # Конфігурація
├── services.json   # Дані про послуги
├── requirements.txt # Залежності
└── .env           # Токени та посилання
```
