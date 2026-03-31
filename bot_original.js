const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const config = require('./config');

const bot = new TelegramBot(config.BOT_TOKEN, { polling: true });

const { data, adminsData, ALTEGIO_URL, ALTEGIO_API_KEY, ALTEGIO_LOCATION_ID } = config;

const userSessions = {};

function getMainMenu() {
    return {
        reply_markup: {
            inline_keyboard: [
                [{ text: '🌐 Записатися на сайті', url: ALTEGIO_URL }],
                [{ text: '📝 Записатися через бот', callback_data: 'start_booking' }],
                [{ text: '💆 Послуги та ціни', callback_data: 'services' }],
                [{ text: '👩‍⚕️ Наші спеціалісти', callback_data: 'staff' }],
                [{ text: '⭐ Відгуки', callback_data: 'reviews' }],
                [{ text: 'ℹ️ Про нас', callback_data: 'about' }],
                [{ text: '📞 Контакти', callback_data: 'contact' }]
            ]
        }
    };
}

async function callGemini(prompt) {
    if (!config.GEMINI_API_KEY) {
        console.log('No GEMINI_API_KEY');
        return null;
    }
    try {
        const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${config.GEMINI_API_KEY}`,
            {
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.9, maxOutputTokens: 500 }
            },
            { timeout: 15000 }
        );
        return response.data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
    } catch (e) {
        console.log('Gemini error:', e.response?.data || e.message);
        return null;
    }
}

async function answerAI(question, category) {
    const prompts = {
        laser: `Ти - адміністратор салону SYNERGY у Львові. Спеціаліст: Соломія та Леся.
Лазер: DEKA Moveo олександритовий. Ціни: пахви 640 грн, бікіні 600 грн, ноги 990 грн. Тел: ${data.contact.phone}
Питання: "${question}"
Відповідь українською 2-3 речення, дружньо.`,

        cosmetology: `Ти - адміністратор салону SYNERGY у Львові. Спеціаліст: Ілона.
Послуги: чистки, пілінги, AQUAPURE. Ціни: чистка від 850 грн. Тел: ${data.contact.phone}
Питання: "${question}"
Відповідь українською 2-3 речення, дружньо.`,

        massage: `Ти - адміністратор салону SYNERGY у Львові. Спеціаліст: Владислав.
Масаж: антицелюлітний, лімфодренажний. Ціни: від 600 грн. Тел: ${data.contact.phone}
Питання: "${question}"
Відповідь українською 2-3 речення, дружньо.`,

        aquasphera: `Ти - адміністратор салону SYNERGY у Львові. Спеціаліст: Оля.
Ендосфера терапія - 900 грн. Тел: ${data.contact.phone}
Питання: "${question}"
Відповідь українською 2-3 речення, дружньо.`
    };

    const response = await callGemini(prompts[category] || prompts.laser);
    if (response) return response;
    
    return 'Для детальної інформації зателефонуйте нам! 📞 ' + data.contact.phone;
}

async function createAltegioBooking(name, phone, serviceId, staffId, datetime) {
    if (!ALTEGIO_API_KEY) return { success: false, error: 'No API key' };
    try {
        const response = await axios.post(
            `https://n816358.alteg.io/api/v2/records/${ALTEGIO_LOCATION_ID}`,
            {
                client: { name, phone },
                staff_id: staffId,
                services: [{ id: serviceId }],
                datetime: datetime,
                save_if_busy: true
            },
            {
                headers: { Authorization: `Bearer ${ALTEGIO_API_KEY}`, 'Content-Type': 'application/json' },
                timeout: 15000
            }
        );
        return { success: true, data: response.data };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

// ==================== COMMAND HANDLERS ====================

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    delete userSessions[chatId];
    bot.sendMessage(chatId, `🏠 <b>S Y N E R G Y</b>\n\n✨ ${data.welcome.subtitle}\n\n${data.welcome.description}`, { parse_mode: 'HTML', ...getMainMenu() });
});

// ==================== CALLBACK HANDLERS ====================

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const dataCB = query.data;
    
    await bot.answerCallbackQuery(query.id);
    
    const session = userSessions[chatId];
    
    // ============ MAIN MENU ============
    
    if (dataCB === 'back_main') {
        delete userSessions[chatId];
        bot.editMessageText(`🏠 <b>S Y N E R G Y</b>\n\n✨ ${data.welcome.subtitle}\n\n${data.welcome.description}`, 
            { chat_id: chatId, message_id: messageId, parse_mode: 'HTML', ...getMainMenu() });
        return;
    }
    
    if (dataCB === 'start_booking') {
        userSessions[chatId] = { step: 'choose_category' };
        bot.editMessageText('📅 <b>Запис через бот</b>\n\nОберіть категорію:',
            { chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
              reply_markup: {
                  inline_keyboard: [
                      [{ text: '🔴 Лазерна Епіляція', callback_data: 'cat_laser' }],
                      [{ text: '💄 Косметологія', callback_data: 'cat_cosmetology' }],
                      [{ text: '💆 Масаж', callback_data: 'cat_massage' }],
                      [{ text: '🌊 Ендосфера', callback_data: 'cat_aquasphera' }],
                      [{ text: '🔙 На головну', callback_data: 'back_main' }]
                  ]
              }
            });
        return;
    }
    
    // ============ INFO PAGES ============
    
    if (dataCB === 'services') {
        const keyboard = data.services.map((cat, i) => 
            [{ text: cat.category, callback_data: `services_cat_${i}` }]
        );
        keyboard.push([{ text: '🔙 На головну', callback_data: 'back_main' }]);
        bot.editMessageText('💆 <b>Послуги та ціни</b>\n\nОберіть категорію:',
            { chat_id: chatId, message_id: messageId, parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } });
        return;
    }
    
    if (dataCB.startsWith('services_cat_')) {
        const idx = parseInt(dataCB.replace('services_cat_', ''));
        const cat = data.services[idx];
        let text = `<b>${cat.category}</b>\n\n`;
        cat.items.forEach(item => {
            text += `▫️ <b>${item.name}</b>\n   ⏱ ${item.duration}  |  💰 ${item.price}\n\n`;
        });
        text += '📅 Для запису: /book';
        bot.editMessageText(text, { chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
            reply_markup: { inline_keyboard: [[{ text: '🔙 Назад', callback_data: 'services' }]] } });
        return;
    }
    
    if (dataCB === 'staff') {
        let text = '👩‍⚕️ <b>Наші спеціалісти</b>\n\n';
        data.staff.forEach(m => {
            text += `👤 <b>${m.name}</b>\n   🎓 ${m.role}\n   ✨ ${m.specialty}\n\n`;
        });
        bot.editMessageText(text, { chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
            reply_markup: { inline_keyboard: [[{ text: '🔙 Назад', callback_data: 'back_main' }]] } });
        return;
    }
    
    if (dataCB === 'reviews') {
        let text = '⭐ <b>Відгуки</b>\n\n';
        data.reviews.forEach(r => {
            text += `💬 <b>${r.name}</b> — ${r.service}\n   «${r.text}»\n\n`;
        });
        bot.editMessageText(text, { chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
            reply_markup: { inline_keyboard: [[{ text: '🔙 Назад', callback_data: 'back_main' }]] } });
        return;
    }
    
    if (dataCB === 'about') {
        bot.editMessageText(`ℹ️ <b>Про SYNERGY</b>\n\n${data.welcome.about}`,
            { chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
              reply_markup: { inline_keyboard: [[{ text: '🔙 Назад', callback_data: 'back_main' }]] } });
        return;
    }
    
    if (dataCB === 'contact') {
        const c = data.contact;
        bot.editMessageText(`📞 <b>Контакти</b>\n\n📱 ${c.phone}\n📍 ${c.location}\n📸 ${c.instagram}\n🕐 ${c.working_hours}`,
            { chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
              reply_markup: { inline_keyboard: [[{ text: '🔙 Назад', callback_data: 'back_main' }]] } });
        return;
    }
    
    // ============ AI QUESTION SYSTEM ============
    
    if (dataCB === 'ask_ai') {
        userSessions[chatId] = { ...session, step: 'ai_question', awaitingQuestion: true };
        
        const categoryNames = { laser: 'лазерну епіляцію', cosmetology: 'косметологію', massage: 'масаж', aquasphera: 'ендосферу' };
        const catName = categoryNames[session?.category] || 'наші послуги';
        
        bot.editMessageText(`❓ <b>Задайте питання</b>\n\nНапишіть ваше запитання про ${catName} і я відповім!`,
            { chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
              reply_markup: { inline_keyboard: [[{ text: '🔙 Скасувати', callback_data: 'cancel_ai' }]] } });
        return;
    }
    
    if (dataCB === 'cancel_ai') {
        if (session?.category) {
            const catSession = session.category;
            delete userSessions[chatId];
            userSessions[chatId] = { category: catSession, step: 'after_ai' };
            showCategoryStart(chatId, messageId, catSession);
        } else {
            bot.editMessageText(`🏠 <b>Головне меню</b>`,
                { chat_id: chatId, message_id: messageId, parse_mode: 'HTML', ...getMainMenu() });
        }
        return;
    }
    
    // ============ LASER CATEGORY ============
    
    if (dataCB === 'cat_laser') {
        userSessions[chatId] = { category: 'laser', step: 'laser_exp' };
        bot.editMessageText('💆 <b>Лазерна Епіляція</b>\n\nВи раніше робили лазерну епіляцію?',
            { chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
              reply_markup: {
                  inline_keyboard: [
                      [{ text: '✅ Так', callback_data: 'laser_exp_yes' }],
                      [{ text: '❌ Ні, вперше', callback_data: 'laser_exp_no' }],
                      [{ text: '❓ Задати питання', callback_data: 'ask_ai' }],
                      [{ text: '🔙 Назад', callback_data: 'start_booking' }]
                  ]
              }
            });
        return;
    }
    
    if (dataCB === 'laser_exp_yes') {
        userSessions[chatId].step = 'laser_type';
        bot.editMessageText('💆 <b>Лазерна Епіляція</b>\n\nЧудово! Ви робили на діодному чи олександритовому лазері?',
            { chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
              reply_markup: {
                  inline_keyboard: [
                      [{ text: '🔴 Діодний', callback_data: 'laser_diode' }],
                      [{ text: '💎 Олександритовий', callback_data: 'laser_alex' }],
                      [{ text: '❓ Задати питання', callback_data: 'ask_ai' }],
                      [{ text: '🔙 Назад', callback_data: 'cat_laser' }]
                  ]
              }
            });
        return;
    }
    
    if (dataCB === 'laser_exp_no') {
        userSessions[chatId].step = 'laser_gender';
        bot.editMessageText('💆 <b>Лазерна Епіляція</b>\n\nОлександритовий лазер DEKA Moveo - ефективний та безболісний метод!\n\nОберіть стать:',
            { chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
              reply_markup: {
                  inline_keyboard: [
                      [{ text: '👩 Жінка', callback_data: 'laser_woman' }],
                      [{ text: '👨 Чоловік', callback_data: 'laser_man' }],
                      [{ text: '❓ Задати питання', callback_data: 'ask_ai' }],
                      [{ text: '🔙 Назад', callback_data: 'cat_laser' }]
                  ]
              }
            });
        return;
    }
    
    if (dataCB === 'laser_diode') {
        userSessions[chatId].step = 'laser_gender';
        bot.editMessageText('💆 <b>Діодний vs Олександритовий</b>\n\nНаш олександритовий DEKA Moveo кращий:\n• Швидший результат\n• Менше процедур\n• Працює на всіх типах шкіри\n• Безболісний\n\nОберіть стать:',
            { chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
              reply_markup: {
                  inline_keyboard: [
                      [{ text: '👩 Жінка', callback_data: 'laser_woman' }],
                      [{ text: '👨 Чоловік', callback_data: 'laser_man' }],
                      [{ text: '❓ Задати питання', callback_data: 'ask_ai' }],
                      [{ text: '🔙 Назад', callback_data: 'cat_laser' }]
                  ]
              }
            });
        return;
    }
    
    if (dataCB === 'laser_alex') {
        userSessions[chatId].step = 'laser_gender';
        bot.editMessageText('💆 <b>Чудово!</b>\n\nОлександритовий лазер - найкращий вибір!\n\nОберіть стать:',
            { chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
              reply_markup: {
                  inline_keyboard: [
                      [{ text: '👩 Жінка', callback_data: 'laser_woman' }],
                      [{ text: '👨 Чоловік', callback_data: 'laser_man' }],
                      [{ text: '❓ Задати питання', callback_data: 'ask_ai' }],
                      [{ text: '🔙 Назад', callback_data: 'cat_laser' }]
                  ]
              }
            });
        return;
    }
    
    if (dataCB === 'laser_woman' || dataCB === 'laser_man') {
        const gender = dataCB.replace('laser_', '');
        userSessions[chatId].gender = gender;
        userSessions[chatId].step = 'laser_service';
        showLaserServices(chatId, messageId, gender);
        return;
    }
    
    if (dataCB.startsWith('laser_s_')) {
        const parts = dataCB.split('_');
        const gender = parts[2];
        const idx = parseInt(parts[3]);
        
        const services = adminsData.services[`laser_${gender}`] || [];
        const service = services[idx];
        if (!service) return;
        
        userSessions[chatId].serviceIndex = idx;
        userSessions[chatId].serviceKey = `laser_${gender}`;
        userSessions[chatId].step = 'laser_worker';
        
        const workers = adminsData.categories.laser?.workers || [];
        const keyboard = workers.map(w => 
            [{ text: `${w.name}`, callback_data: `worker_${w.id}` }]
        );
        keyboard.push([{ text: '❓ Задати питання', callback_data: 'ask_ai' }]);
        keyboard.push([{ text: '🔙 Змінити зону', callback_data: `laser_woman` }]);
        
        bot.editMessageText(`✅ <b>${service.name}</b>\n💰 ${service.price}\n⏱ ${service.time}\n\nОберіть спеціаліста:`,
            { chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
              reply_markup: { inline_keyboard: keyboard } });
        return;
    }
    
    // ============ COSMETOLOGY CATEGORY ============
    
    if (dataCB === 'cat_cosmetology') {
        userSessions[chatId] = { category: 'cosmetology', step: 'cosmetology_service' };
        showCosmetologyServices(chatId, messageId);
        return;
    }
    
    if (dataCB.startsWith('cosmo_s_')) {
        const idx = parseInt(dataCB.replace('cosmo_s_', ''));
        const services = adminsData.services.cosmetology || [];
        const service = services[idx];
        if (!service) return;
        
        userSessions[chatId].serviceIndex = idx;
        userSessions[chatId].serviceKey = 'cosmetology';
        userSessions[chatId].step = 'cosmetology_worker';
        
        const workers = adminsData.categories.cosmetology?.workers || [];
        const keyboard = workers.map(w => 
            [{ text: `${w.name}`, callback_data: `worker_${w.id}` }]
        );
        keyboard.push([{ text: '❓ Задати питання', callback_data: 'ask_ai' }]);
        keyboard.push([{ text: '🔙 Інша процедура', callback_data: 'cat_cosmetology' }]);
        
        bot.editMessageText(`✅ <b>${service.name}</b>\n💰 ${service.price}\n⏱ ${service.time}\n\nОберіть спеціаліста:`,
            { chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
              reply_markup: { inline_keyboard: keyboard } });
        return;
    }
    
    // ============ MASSAGE CATEGORY ============
    
    if (dataCB === 'cat_massage') {
        userSessions[chatId] = { category: 'massage', step: 'massage_service' };
        showMassageServices(chatId, messageId);
        return;
    }
    
    if (dataCB.startsWith('massage_s_')) {
        const idx = parseInt(dataCB.replace('massage_s_', ''));
        const services = adminsData.services.massage || [];
        const service = services[idx];
        if (!service) return;
        
        userSessions[chatId].serviceIndex = idx;
        userSessions[chatId].serviceKey = 'massage';
        userSessions[chatId].step = 'massage_worker';
        
        const workers = adminsData.categories.massage?.workers || [];
        const keyboard = workers.map(w => 
            [{ text: `${w.name}`, callback_data: `worker_${w.id}` }]
        );
        keyboard.push([{ text: '❓ Задати питання', callback_data: 'ask_ai' }]);
        keyboard.push([{ text: '🔙 Інша процедура', callback_data: 'cat_massage' }]);
        
        bot.editMessageText(`✅ <b>${service.name}</b>\n💰 ${service.price}\n⏱ ${service.time}\n\nОберіть спеціаліста:`,
            { chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
              reply_markup: { inline_keyboard: keyboard } });
        return;
    }
    
    // ============ AQUASPHERA CATEGORY ============
    
    if (dataCB === 'cat_aquasphera') {
        userSessions[chatId] = { category: 'aquasphera', step: 'aquasphera_service' };
        showAquaspheraServices(chatId, messageId);
        return;
    }
    
    if (dataCB.startsWith('aqua_s_')) {
        const idx = parseInt(dataCB.replace('aqua_s_', ''));
        const services = adminsData.services.aquasphera || [];
        const service = services[idx];
        if (!service) return;
        
        userSessions[chatId].serviceIndex = idx;
        userSessions[chatId].serviceKey = 'aquasphera';
        userSessions[chatId].step = 'aquasphera_worker';
        
        const workers = adminsData.categories.aquasphera?.workers || [];
        const keyboard = workers.map(w => 
            [{ text: `${w.name}`, callback_data: `worker_${w.id}` }]
        );
        keyboard.push([{ text: '❓ Задати питання', callback_data: 'ask_ai' }]);
        keyboard.push([{ text: '🔙 Інша процедура', callback_data: 'cat_aquasphera' }]);
        
        bot.editMessageText(`✅ <b>${service.name}</b>\n💰 ${service.price}\n⏱ ${service.time}\n\nОберіть спеціаліста:`,
            { chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
              reply_markup: { inline_keyboard: keyboard } });
        return;
    }
    
    // ============ WORKER SELECTED ============
    
    if (dataCB.startsWith('worker_')) {
        const workerId = parseInt(dataCB.replace('worker_', ''));
        userSessions[chatId].workerId = workerId;
        userSessions[chatId].step = 'enter_name';
        
        bot.editMessageText('👤 <b>Введіть ваше ПІБ</b>\n(Прізвище, ім\'я, по батькові)',
            { chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
              reply_markup: { inline_keyboard: [[{ text: '❓ Задати питання', callback_data: 'ask_ai' }]] } });
        return;
    }
    
    // ============ CONFIRM BOOKING ============
    
    if (dataCB === 'confirm_booking') {
        if (!session) return;
        
        const { category, serviceIndex, workerId, name, phone, datetime } = session;
        const services = adminsData.services[session.serviceKey] || [];
        const workers = adminsData.categories[category]?.workers || [];
        
        const service = services[serviceIndex] || { name: '?', alteg: 123456 };
        const worker = workers.find(w => w.id === workerId) || workers[0];
        
        const result = await createAltegioBooking(name, phone, service.alteg, worker.altegio_staff_id, datetime);
        
        if (result.success) {
            bot.editMessageText(`✅ <b>Запис створено!</b>\n\n👤 ${name}\n📱 ${phone}\n💆 ${service.name}\n👩‍⚕️ ${worker.name}\n🕐 ${datetime}\n\nЧекаємо на вас!`,
                { chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
                  reply_markup: { inline_keyboard: [[{ text: '🏠 Головне меню', callback_data: 'back_main' }]] } });
        } else {
            bot.editMessageText(`⚠️ <b>Помилка:</b> ${result.error}`,
                { chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
                  reply_markup: { inline_keyboard: [[{ text: '📞 Зв\'язатися', url: 'https://t.me/synergy_lviv' }]] } });
        }
        
        delete userSessions[chatId];
        return;
    }
});

// ==================== MESSAGE HANDLERS ====================

bot.on('message', async (msg) => {
    if (msg.text?.startsWith('/')) return;
    if (msg.text === '/start') return;
    
    const chatId = msg.chat.id;
    const text = msg.text;
    const session = userSessions[chatId];
    
    if (!session) return;
    
    // ============ AI QUESTION MODE ============
    
    if (session.step === 'ai_question' && session.awaitingQuestion) {
        const response = await answerAI(text, session.category);
        
        bot.sendMessage(chatId, `${response}`,
            { parse_mode: 'HTML',
              reply_markup: {
                  inline_keyboard: [
                      [{ text: '🔙 Повернутися до запису', callback_data: 'back_to_booking' }],
                      [{ text: '❓ Інше питання', callback_data: 'ask_ai' }],
                      [{ text: '🏠 Головне меню', callback_data: 'back_main' }]
                  ]
              }
            }
        );
        
        session.awaitingQuestion = false;
        return;
    }
    
    if (text === 'back_to_booking' || session.step === 'back_to_booking') {
        if (session.category === 'laser') {
            const gender = session.gender || 'woman';
            showLaserServices(chatId, null, gender);
        } else if (session.category === 'cosmetology') {
            showCosmetologyServices(chatId, null);
        } else if (session.category === 'massage') {
            showMassageServices(chatId, null);
        } else if (session.category === 'aquasphera') {
            showAquaspheraServices(chatId, null);
        }
        return;
    }
    
    // ============ LASER TYPE QUESTION (user types diode or alex) ============
    
    if (session.step === 'laser_type') {
        const lower = text.toLowerCase();
        
        if (lower.includes('діод') || lower.includes('диод') || lower.includes('diode')) {
            session.step = 'laser_gender';
            bot.sendMessage(chatId, 
                '💆 <b>Діодний vs Олександритовий</b>\n\nНаш DEKA Moveo кращий:\n• Швидший результат\n• Менше процедур\n• Працює на всіх типах шкіри\n• Безболісний\n\nОберіть стать:',
                { parse_mode: 'HTML',
                  reply_markup: {
                      inline_keyboard: [
                          [{ text: '👩 Жінка', callback_data: 'laser_woman' }],
                          [{ text: '👨 Чоловік', callback_data: 'laser_man' }],
                          [{ text: '❓ Задати питання', callback_data: 'ask_ai' }],
                          [{ text: '🔙 Назад', callback_data: 'cat_laser' }]
                      ]
                  }
                });
        } else if (lower.includes('олекс') || lower.includes('алекс') || lower.includes('alex')) {
            session.step = 'laser_gender';
            bot.sendMessage(chatId, '💆 <b>Чудово!</b>\n\nОберіть стать:',
                { parse_mode: 'HTML',
                  reply_markup: {
                      inline_keyboard: [
                          [{ text: '👩 Жінка', callback_data: 'laser_woman' }],
                          [{ text: '👨 Чоловік', callback_data: 'laser_man' }],
                          [{ text: '❓ Задати питання', callback_data: 'ask_ai' }],
                          [{ text: '🔙 Назад', callback_data: 'cat_laser' }]
                      ]
                  }
                });
        } else {
            bot.sendMessage(chatId, '💆 Будь ласка, оберіть або напишіть "діодний" / "олександретовий"',
                { parse_mode: 'HTML',
                  reply_markup: {
                      inline_keyboard: [
                          [{ text: '🔴 Діодний', callback_data: 'laser_diode' }],
                          [{ text: '💎 Олександритовий', callback_data: 'laser_alex' }],
                          [{ text: '❓ Задати питання', callback_data: 'ask_ai' }]
                      ]
                  }
                });
        }
        return;
    }
    
    // ============ ENTER NAME ============
    
    if (session.step === 'enter_name') {
        session.name = text;
        session.step = 'enter_phone';
        bot.sendMessage(chatId, `✅ <b>${session.name}</b>\n\n📱 Введіть телефон:`, { parse_mode: 'HTML' });
        return;
    }
    
    // ============ ENTER PHONE ============
    
    if (session.step === 'enter_phone') {
        session.phone = text;
        session.step = 'enter_datetime';
        bot.sendMessage(chatId, `✅ <b>${session.phone}</b>\n\n📅 Дата та час:\n<i>Наприклад: 15.04.2026 о 14:00</i>`, { parse_mode: 'HTML' });
        return;
    }
    
    // ============ ENTER DATETIME & CONFIRM ============
    
    if (session.step === 'enter_datetime') {
        session.datetime = text;
        
        const services = adminsData.services[session.serviceKey] || [];
        const workers = adminsData.categories[session.category]?.workers || [];
        const service = services[session.serviceIndex] || { name: '?' };
        const worker = workers.find(w => w.id === session.workerId) || { name: '?' };
        
        bot.sendMessage(chatId,
            `📋 <b>Перевірте дані:</b>\n\n👤 ${session.name}\n📱 ${session.phone}\n💆 ${service.name}\n💰 ${service.price}\n👩‍⚕️ ${worker.name}\n🕐 ${session.datetime}\n\n✅ <b>Все вірно?</b>`,
            { parse_mode: 'HTML',
              reply_markup: {
                  inline_keyboard: [
                      [{ text: '✅ Підтвердити', callback_data: 'confirm_booking' }],
                      [{ text: '❌ Скасувати', callback_data: 'back_main' }]
                  ]
              }
            }
        );
        
        session.step = 'confirm';
        return;
    }
});

// ==================== HELPER FUNCTIONS ====================

function showLaserServices(chatId, messageId, gender) {
    const services = adminsData.services[`laser_${gender}`] || [];
    const keyboard = services.slice(0, 10).map((s, i) => 
        [{ text: `${s.name} - ${s.price}`, callback_data: `laser_s_${gender}_${i}` }]
    );
    keyboard.push([{ text: '❓ Задати питання', callback_data: 'ask_ai' }]);
    keyboard.push([{ text: '🔙 Назад', callback_data: 'cat_laser' }]);
    
    const msg = '💆 <b>Лазерна Епіляція</b>\n\nОберіть зону:';
    
    if (messageId) {
        bot.editMessageText(msg, { chat_id: chatId, message_id: messageId, parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } });
    } else {
        bot.sendMessage(chatId, msg, { parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } });
    }
}

function showCosmetologyServices(chatId, messageId) {
    const services = adminsData.services.cosmetology || [];
    const keyboard = services.slice(0, 10).map((s, i) => 
        [{ text: `${s.name} - ${s.price}`, callback_data: `cosmo_s_${i}` }]
    );
    keyboard.push([{ text: '❓ Задати питання', callback_data: 'ask_ai' }]);
    keyboard.push([{ text: '🔙 Назад', callback_data: 'start_booking' }]);
    
    const msg = '💄 <b>Косметологія</b>\n\nОберіть процедуру:';
    
    if (messageId) {
        bot.editMessageText(msg, { chat_id: chatId, message_id: messageId, parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } });
    } else {
        bot.sendMessage(chatId, msg, { parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } });
    }
}

function showMassageServices(chatId, messageId) {
    const services = adminsData.services.massage || [];
    const keyboard = services.map((s, i) => 
        [{ text: `${s.name} - ${s.price}`, callback_data: `massage_s_${i}` }]
    );
    keyboard.push([{ text: '❓ Задати питання', callback_data: 'ask_ai' }]);
    keyboard.push([{ text: '🔙 Назад', callback_data: 'start_booking' }]);
    
    const msg = '💆 <b>Масаж</b>\n\nОберіть процедуру:';
    
    if (messageId) {
        bot.editMessageText(msg, { chat_id: chatId, message_id: messageId, parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } });
    } else {
        bot.sendMessage(chatId, msg, { parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } });
    }
}

function showAquaspheraServices(chatId, messageId) {
    const services = adminsData.services.aquasphera || [];
    const keyboard = services.map((s, i) => 
        [{ text: `${s.name} - ${s.price}`, callback_data: `aqua_s_${i}` }]
    );
    keyboard.push([{ text: '❓ Задати питання', callback_data: 'ask_ai' }]);
    keyboard.push([{ text: '🔙 Назад', callback_data: 'start_booking' }]);
    
    const msg = '🌊 <b>Ендосфера терапія</b>\n\nОберіть процедуру:';
    
    if (messageId) {
        bot.editMessageText(msg, { chat_id: chatId, message_id: messageId, parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } });
    } else {
        bot.sendMessage(chatId, msg, { parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } });
    }
}

function showCategoryStart(chatId, messageId, category) {
    if (category === 'laser') {
        bot.editMessageText('💆 <b>Лазерна Епіляція</b>\n\nОберіть стать:',
            { chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
              reply_markup: {
                  inline_keyboard: [
                      [{ text: '👩 Жінка', callback_data: 'laser_woman' }],
                      [{ text: '👨 Чоловік', callback_data: 'laser_man' }],
                      [{ text: '❓ Задати питання', callback_data: 'ask_ai' }],
                      [{ text: '🔙 Назад', callback_data: 'cat_laser' }]
                  ]
              }
            });
    } else if (category === 'cosmetology') {
        showCosmetologyServices(chatId, messageId);
    } else if (category === 'massage') {
        showMassageServices(chatId, messageId);
    } else if (category === 'aquasphera') {
        showAquaspheraServices(chatId, messageId);
    }
}

console.log('SYNERGY Bot started!');
