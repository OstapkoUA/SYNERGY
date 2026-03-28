from flask import Flask
import os
import threading

app_flask = Flask(__name__)

@app_flask.route('/')
def health():
    return 'Bot is running!'

@app_flask.route('/health')
def health2():
    return 'OK!'

def run_flask():
    port = int(os.getenv("PORT", 8080))
    app_flask.run(host='0.0.0.0', port=port)

if __name__ == '__main__':
    from bot import main
    
    flask_thread = threading.Thread(target=run_flask)
    flask_thread.daemon = True
    flask_thread.start()
    
    print("SYNERGY Bot started!")
    application = main()
    application.run_polling(allowed_updates=Update.ALL_TYPES)
