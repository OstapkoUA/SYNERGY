##SYNERGY Telegram Bot
Telegram bot for the SYNERGY beauty and wellness studio!

##Features
📅 Booking via Altegio

💆 Services and pricing

👩‍⚕️ Specialist catalog

⭐ Client reviews

📝 Data submission (coming soon)

ℹ️ Studio information

##Installation
Bash
pip install -r requirements.txt
node bot.js
Commands
/start - Main menu

/book - Quick booking

##Configuration
Edit the .env file:
```
BOT_TOKEN=your_telegram_bot_token
ALTEGIO_BOOKING_URL=your_altegio_link
OPENAI_API_KEY=your_openai_api_key
GEMINI_API_KEY=your_gemini_api_key
```
You can use either OpenAI or Gemini.

##File Structure
```
├── bot.js           # Main bot code
├── config.js        # Configuration
├── services.json    # Service data
├── requirements.txt # Dependencies
└── .env             # Tokens and links
```
