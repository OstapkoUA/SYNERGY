const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const config = require('./config');

const bot = new TelegramBot(config.BOT_TOKEN, {
    polling: {
        interval: 300,
        autoStart: true,
        params: { timeout: 10 }
    }
});

// Per-user callback lock to prevent rapid button presses
const userLocks = new Map();

function acquireLock(chatId) {
    if (userLocks.has(chatId)) return false;
    userLocks.set(chatId, true);
    return true;
}

function releaseLock(chatId) {
    userLocks.delete(chatId);
}

const { data, adminsData, ALTEGIO_URL, ALTEGIO_API_KEY, ALTEGIO_LOCATION_ID, GOOGLE_API_KEY, GOOGLE_LOCATION_ID } = config;

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

async function createAltegioBooking(name, phone, serviceIds, staffId, datetime) {
    if (!ALTEGIO_API_KEY) return { success: false, error: 'No API key' };
    try {
        let dateStr = datetime;
        const match = datetime.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})\s*[оo]?\s*(\d{1,2}):(\d{2})/);
        if (match) {
            dateStr = `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')} ${match[4].padStart(2, '0')}:${match[5]}:00`;
        }
        
        const serviceId = Array.isArray(serviceIds) ? serviceIds[0] : serviceIds;
        
        const response = await axios.post(
            `https://n816358.alteg.io/api/v2/companies/${ALTEGIO_LOCATION_ID}/activities`,
            {
                staff_id: staffId,
                service_id: serviceId,
                resource_instance_ids: [],
                label_ids: [],
                date: dateStr,
                length: 3600,
                capacity: 1,
                comment: name + ' | ' + phone
            },
            {
                headers: { 
                    Authorization: `Bearer ${ALTEGIO_API_KEY}`, 
                    'Content-Type': 'application/json',
                    Accept: 'application/vnd.alteg.v2+json'
                },
                timeout: 15000
            }
        );
        return { success: true, data: response.data };
    } catch (e) {
        return { success: false, error: e.response?.data?.meta?.message || e.message };
    }
}


async function fetchGoogleReviews() {
    if (!GOOGLE_API_KEY || !GOOGLE_LOCATION_ID) {
        return data.reviews;
    }
    try {
        const response = await axios.get(
            'https://mybusiness.googleapis.com/v1/accounts/-/locations/' + GOOGLE_LOCATION_ID + '/reviews',
            {
                headers: { Authorization: 'Bearer ' + GOOGLE_API_KEY },
                params: { pageSize: 10, orderBy: 'UPDATE_TIME desc' }
            }
        );
        const reviews = response.data.reviews || [];
        return reviews.map(r => ({
            name: r.author.displayName || 'Клієнт',
            service: '',
            text: r.comment || '',
            rating: r.starRating || 5
        }));
    } catch (e) {
        console.log('Google Reviews error:', e.message);
        return data.reviews;
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
    
    if (!acquireLock(chatId)) return;
    
    try {
        await bot.answerCallbackQuery(query.id);
        
        if (!userSessions[chatId]) {
        userSessions[chatId] = {};
    }
    
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
        bot.editMessageText('⏳ Завантажуємо відгуки з Google Maps...', 
            { chat_id: chatId, message_id: messageId, parse_mode: 'HTML' });
        
        const reviews = await fetchGoogleReviews();
        
        let text = '⭐ <b>Відгуки з Google Maps</b>\n\n';
        reviews.slice(0, 10).forEach(r => {
            const stars = '⭐'.repeat(r.rating || 5);
            text += `💬 <b>${r.name}</b> ${stars}\n   «${r.text}»\n\n`;
        });
        text += '🔗 <a href="https://g.page/synergy-lviv">Більше відгуків на Google Maps</a>';
        
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
        userSessions[chatId] = { category: 'laser', step: 'laser_offer' };
        bot.editMessageText('💆 <b>Лазерна Епіляція</b>\n\nВас зацікавила наша спеціальна пропозиція на лазерну епіляцію?',
            { chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
              reply_markup: {
                  inline_keyboard: [
                      [{ text: '✅ Так', callback_data: 'laser_offer_yes' }],
                      [{ text: '🔙 Назад', callback_data: 'start_booking' }]
                  ]
              }
            });
        return;
    }
    
    if (dataCB === 'laser_offer_yes') {
        userSessions[chatId].step = 'laser_self_gift';
        bot.editMessageText('💆 <b>Лазерна Епіляція</b>\n\nПідкажіть, ви для себе обираєте чи в подарунок?',
            { chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
              reply_markup: {
                  inline_keyboard: [
                      [{ text: '👤 Для себе', callback_data: 'laser_self' }],
                      [{ text: '🎁 В подарунок', callback_data: 'laser_gift' }],
                      [{ text: '🔙 Назад', callback_data: 'cat_laser' }]
                  ]
              }
            });
        return;
    }
    
    if (dataCB === 'laser_self' || dataCB === 'laser_gift') {
        userSessions[chatId].step = 'laser_exp';
        bot.editMessageText('💆 <b>Лазерна Епіляція</b>\n\nЧи робили Ви раніше лазерну епіляцію на олександритовому лазері чи це ваш перший досвід?',
            { chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
              reply_markup: {
                  inline_keyboard: [
                      [{ text: '✅ Так, робила', callback_data: 'laser_exp_yes' }],
                      [{ text: '❌ Ні, вперше', callback_data: 'laser_exp_no' }],
                      [{ text: '🔙 Назад', callback_data: 'laser_self' }]
                  ]
              }
            });
        return;
    }
    
    if (dataCB === 'laser_exp_yes') {
        userSessions[chatId].step = 'laser_type';
        bot.editMessageText('💆 <b>Лазерна Епіляція</b>\n\nНа якому лазері робили?',
            { chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
              reply_markup: {
                  inline_keyboard: [
                      [{ text: '🔴 Діодний', callback_data: 'laser_diode' }],
                      [{ text: '💎 Олександритовий', callback_data: 'laser_alex' }],
                      [{ text: '🔙 Назад', callback_data: 'laser_exp' }]
                  ]
              }
            });
        return;
    }
    
    if (dataCB === 'laser_diode') {
        userSessions[chatId].step = 'laser_gender';
        bot.editMessageText('💆 <b>Лазерна Епіляція</b>\n\nРозуміємо! Результат залежить від апарату, правильно підібраних параметрів та індивідуальних особливостей.\n\nНаш олександритовий DEKA Moveo дає кращий результат:\n• Швидший ефект\n• Менше процедур\n• Безболісний\n\nОберіть стать:',
            { chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
              reply_markup: {
                  inline_keyboard: [
                      [{ text: '👩 Жінка', callback_data: 'laser_woman' }],
                      [{ text: '👨 Чоловік', callback_data: 'laser_man' }],
                      [{ text: '🔙 Назад', callback_data: 'laser_exp_yes' }]
                  ]
              }
            });
        return;
    }
    
    if (dataCB === 'laser_alex') {
        userSessions[chatId].step = 'laser_gender';
        bot.editMessageText('💆 <b>Лазерна Епіляція</b>\n\nЧудово! Ви вже знаєте переваги олександритового лазера!\n\nОберіть стать:',
            { chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
              reply_markup: {
                  inline_keyboard: [
                      [{ text: '👩 Жінка', callback_data: 'laser_woman' }],
                      [{ text: '👨 Чоловік', callback_data: 'laser_man' }],
                      [{ text: '🔙 Назад', callback_data: 'laser_exp_yes' }]
                  ]
              }
            });
        return;
    }
    
    if (dataCB === 'laser_exp_no') {
        userSessions[chatId].step = 'laser_gender';
        bot.editMessageText('💆 <b>Лазерна Епіляція</b>\n\nЧудово! Ми працюємо на олександритовому італійському лазері DEKA Moveo - процедури безболісні та ефективні. 99% клієнтів обирають його, бо втомились терпіти біль!\n\nОберіть стать:',
            { chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
              reply_markup: {
                  inline_keyboard: [
                      [{ text: '👩 Жінка', callback_data: 'laser_woman' }],
                      [{ text: '👨 Чоловік', callback_data: 'laser_man' }],
                      [{ text: '🔙 Назад', callback_data: 'laser_exp' }]
                  ]
              }
            });
        return;
    }
    
    if (dataCB === 'laser_woman' || dataCB === 'laser_man') {
        const gender = dataCB.replace('laser_', '');
        userSessions[chatId].gender = gender;
        userSessions[chatId].serviceKey = `laser_${gender}`;
        userSessions[chatId].step = 'search_services';
        
        bot.editMessageText('💆 <b>Лазерна Епіляція</b>\n\nПідкажіть, на яких ділянках ви бажаєте проводити епіляцію?\n\n<i>Наприклад: ноги, пахви, бікіні...</i>',
            { chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
              reply_markup: {
                  inline_keyboard: [
                      [{ text: '🔙 Назад', callback_data: 'laser_exp' }]
                  ]
              }
            });
        return;
    }
    
    if (dataCB.startsWith('laser_s_')) {
        const parts = dataCB.split('_');
        const gender = parts[2];
        const idx = parseInt(parts[3]);
        
        const services = adminsData.services[`laser_${gender}`] || [];
        const service = services[idx];
        if (!service) return;
        
        if (!userSessions[chatId].selectedZones) {
            userSessions[chatId].selectedZones = [];
        }
        
        const existingIndex = userSessions[chatId].selectedZones.findIndex(z => z.index === idx);
        if (existingIndex === -1) {
            userSessions[chatId].selectedZones.push({ index: idx, name: service.name, price: service.price, time: service.time, altegio_id: service.altegio_id });
        }
        
        userSessions[chatId].serviceKey = `laser_${gender}`;
        
        const selectedZones = userSessions[chatId].selectedZones;
        let totalPrice = 0;
        let totalTime = 0;
        
        let msgText = '📍 <b>Обрані зони:</b>\n\n';
        const keyboard = [];
        
        selectedZones.forEach((z, i) => {
            msgText += `${i + 1}. ${z.name} - ${z.price}\n`;
            totalPrice += parseInt(String(z.price).replace(/\s/g, ''));
            totalTime += parseInt(z.time);
            keyboard.push([{ text: `❌ ${z.name}`, callback_data: `laser_remove_${gender}_${i}` }]);
        });
        
        const hours = Math.floor(totalTime / 60);
        const mins = totalTime % 60;
        const timeStr = hours > 0 ? `${hours} год ${mins} хв` : `${mins} хв`;
        
        msgText += `\n💰 <b>Загальна вартість: ${totalPrice} грн</b>\n⏱ Тривалість: ${timeStr}`;
        
        keyboard.push([{ text: '➕ Додати ще зону', callback_data: `laser_pick_${gender}` }]);
        keyboard.push([{ text: '✅ Продовжити', callback_data: 'laser_zones_done' }]);
        
        bot.editMessageText(msgText,
            { chat_id: chatId, message_id: messageId, parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } });
        return;
    }
    
    if (dataCB.startsWith('laser_remove_')) {
        const parts = dataCB.split('_');
        const idx = parseInt(parts[3]);
        
        if (userSessions[chatId].selectedZones && userSessions[chatId].selectedZones[idx]) {
            userSessions[chatId].selectedZones.splice(idx, 1);
        }
        
        const gender = userSessions[chatId].gender;
        const selectedZones = userSessions[chatId].selectedZones || [];
        
        if (selectedZones.length === 0) {
            bot.editMessageText('📍 <b>Обрані зони:</b>\n\nНічого не обрано',
                { chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
                  reply_markup: { inline_keyboard: [[{ text: '➕ Обрати зони', callback_data: `laser_pick_${gender}` }]] } });
            return;
        }
        
        let totalPrice = 0;
        let totalTime = 0;
        let msgText = '📍 <b>Обрані зони:</b>\n\n';
        const keyboard = [];
        
        selectedZones.forEach((z, i) => {
            msgText += `${i + 1}. ${z.name} - ${z.price}\n`;
            totalPrice += parseInt(String(z.price).replace(/\s/g, ''));
            totalTime += parseInt(z.time);
            keyboard.push([{ text: `❌ ${z.name}`, callback_data: `laser_remove_${gender}_${i}` }]);
        });
        
        const hours = Math.floor(totalTime / 60);
        const mins = totalTime % 60;
        const timeStr = hours > 0 ? `${hours} год ${mins} хв` : `${mins} хв`;
        
        msgText += `\n💰 <b>Загальна вартість: ${totalPrice} грн</b>\n⏱ Тривалість: ${timeStr}`;
        
        keyboard.push([{ text: '➕ Додати ще зону', callback_data: `laser_pick_${gender}` }]);
        keyboard.push([{ text: '✅ Продовжити', callback_data: 'laser_zones_done' }]);
        
        bot.editMessageText(msgText,
            { chat_id: chatId, message_id: messageId, parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } });
        return;
    }
    
    if (dataCB === 'laser_zones_done') {
        userSessions[chatId].step = 'laser_upsell';
        
        const selectedZones = userSessions[chatId].selectedZones || [];
        let totalPrice = 0;
        let totalTime = 0;
        
        selectedZones.forEach(z => {
            totalPrice += parseInt(String(z.price).replace(/\s/g, ''));
            totalTime += parseInt(z.time);
        });
        
        const hours = Math.floor(totalTime / 60);
        const mins = totalTime % 60;
        const timeStr = hours > 0 ? `${hours} год ${mins} хв` : `${mins} хв`;
        
        bot.editMessageText(`💆 <b>Вартість даного комплексу: ${totalPrice} грн</b>\n⏱ Тривалість: ${timeStr}\n\nЗазвичай до цих ділянок додають ще руки до ліктя або верхню губу. Забронувати для вас додатковий час на ці ділянки?`,
            { chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
              reply_markup: {
                  inline_keyboard: [
                      [{ text: '👋 Руки до ліктя', callback_data: 'laser_upsell_arms' }],
                      [{ text: '👄 Верхню губу', callback_data: 'laser_upsell_lips' }],
                      [{ text: '❌ Ні, дякую', callback_data: 'laser_upsell_no' }]
                  ]
              }
            });
        return;
    }
    
    if (dataCB === 'laser_upsell_arms') {
        const gender = userSessions[chatId].gender;
        const armsIdx = 6;
        const services = adminsData.services[`laser_${gender}`] || [];
        const armsService = services[armsIdx];
        
        if (armsService && !userSessions[chatId].selectedZones.find(z => z.index === armsIdx)) {
            userSessions[chatId].selectedZones.push({ index: armsIdx, name: armsService.name, price: armsService.price, time: armsService.time });
        }
        
        const selectedZones = userSessions[chatId].selectedZones || [];
        let totalPrice = 0;
        selectedZones.forEach(z => totalPrice += parseInt(String(z.price).replace(/\s/g, '')));
        
        bot.editMessageText(`✅ Додано: ${armsService?.name || 'Руки'}\n\n💰 <b>Загальна вартість: ${totalPrice} грн</b>\n\nОберіть спеціаліста:`,
            { chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
              reply_markup: {
                  inline_keyboard: [
                      ...(adminsData.categories.laser?.workers || []).map(w => 
                          [{ text: w.name, callback_data: `worker_${w.id}` }]
                      ),
                      [{ text: '🔙 Назад', callback_data: 'laser_zones_done' }]
                  ]
              }
            });
        return;
    }
    
    if (dataCB === 'laser_upsell_lips') {
        const gender = userSessions[chatId].gender;
        const lipsIdx = 21;
        const services = adminsData.services[`laser_${gender}`] || [];
        const lipsService = services[lipsIdx];
        
        if (lipsService && !userSessions[chatId].selectedZones.find(z => z.index === lipsIdx)) {
            userSessions[chatId].selectedZones.push({ index: lipsIdx, name: lipsService.name, price: lipsService.price, time: lipsService.time });
        }
        
        const selectedZones = userSessions[chatId].selectedZones || [];
        let totalPrice = 0;
        selectedZones.forEach(z => totalPrice += parseInt(String(z.price).replace(/\s/g, '')));
        
        bot.editMessageText(`✅ Додано: ${lipsService?.name || 'Верхня губа'}\n\n💰 <b>Загальна вартість: ${totalPrice} грн</b>\n\nОберіть спеціаліста:`,
            { chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
              reply_markup: {
                  inline_keyboard: [
                      ...(adminsData.categories.laser?.workers || []).map(w => 
                          [{ text: w.name, callback_data: `worker_${w.id}` }]
                      ),
                      [{ text: '🔙 Назад', callback_data: 'laser_zones_done' }]
                  ]
              }
            });
        return;
    }
    
    if (dataCB === 'laser_upsell_no') {
        const selectedZones = userSessions[chatId].selectedZones || [];
        let totalPrice = 0;
        selectedZones.forEach(z => totalPrice += parseInt(String(z.price).replace(/\s/g, '')));
        
        bot.editMessageText(`💰 <b>Вартість: ${totalPrice} грн</b>\n\nПри оплаті сьогодні у подарунок отримаєте тканинну маску для обличчя! 🎁\n\nОберіть спеціаліста:`,
            { chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
              reply_markup: {
                  inline_keyboard: [
                      ...(adminsData.categories.laser?.workers || []).map(w => 
                          [{ text: w.name, callback_data: `worker_${w.id}` }]
                      ),
                      [{ text: '🔙 Назад', callback_data: 'laser_zones_done' }]
                  ]
              }
            });
        return;
    }
    
    if (dataCB.startsWith('laser_pick_')) {
        const gender = dataCB.replace('laser_pick_', '');
        showLaserServices(chatId, messageId, gender);
        return;
    }
    
    // ============ COSMETOLOGY CATEGORY ============
    
    if (dataCB === 'cat_cosmetology') {
        userSessions[chatId] = { category: 'cosmetology', serviceKey: 'cosmetology', step: 'search_services' };
        bot.editMessageText('💄 <b>Косметологія</b>\n\nЯка процедура вас цікавить?\n\n<i>Наприклад: чистка, пілінг, масаж обличчя</i>',
            { chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
              reply_markup: {
                  inline_keyboard: [
                      [{ text: '📋 Показати всі', callback_data: 'show_all_cosmo' }],
                      [{ text: '🔙 Назад', callback_data: 'start_booking' }]
                  ]
              }
            });
        return;
    }
    
    if (dataCB === 'show_all_cosmo') {
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
        userSessions[chatId] = { category: 'massage', step: 'massage_offer' };
        bot.editMessageText('💆 <b>Масаж</b>\n\nВас зацікавила наша спеціальна пропозиція на масаж?',
            { chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
              reply_markup: {
                  inline_keyboard: [
                      [{ text: '✅ Так', callback_data: 'massage_offer_yes' }],
                      [{ text: '🔙 Назад', callback_data: 'start_booking' }]
                  ]
              }
            });
        return;
    }
    
    if (dataCB === 'massage_offer_yes') {
        userSessions[chatId].step = 'massage_exp';
        bot.editMessageText('💆 <b>Масаж</b>\n\nЧи робили Ви раніше масаж?',
            { chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
              reply_markup: {
                  inline_keyboard: [
                      [{ text: '✅ Так, робила', callback_data: 'massage_exp_yes' }],
                      [{ text: '❌ Ні, вперше', callback_data: 'massage_exp_no' }],
                      [{ text: '🔙 Назад', callback_data: 'cat_massage' }]
                  ]
              }
            });
        return;
    }
    
    if (dataCB === 'massage_exp_yes' || dataCB === 'massage_exp_no') {
        userSessions[chatId].step = 'massage_type';
        bot.editMessageText('💆 <b>Масаж</b>\n\nЯкий тип масажу вас цікавить?',
            { chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
              reply_markup: {
                  inline_keyboard: [
                      [{ text: '🤲 Ручний масаж', callback_data: 'massage_type_hand' }],
                      [{ text: '🌊 Ендосфера терапія', callback_data: 'massage_type_endo' }],
                      [{ text: '🔙 Назад', callback_data: 'massage_offer_yes' }]
                  ]
              }
            });
        return;
    }
    
    if (dataCB === 'massage_type_hand') {
        userSessions[chatId].step = 'search_services';
        userSessions[chatId].serviceKey = 'massage';
        bot.editMessageText('💆 <b>Ручний Масаж</b>\n\nЯкий масаж вас цікавить?\n\n<i>Наприклад: антицелюлітний, лімфодренажний, спортивний...</i>',
            { chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
              reply_markup: {
                  inline_keyboard: [
                      [{ text: '📋 Показати всі', callback_data: 'show_all_massage' }],
                      [{ text: '🔙 Назад', callback_data: 'massage_type' }]
                  ]
              }
            });
        return;
    }
    
    if (dataCB === 'massage_type_endo') {
        userSessions[chatId].step = 'search_services';
        userSessions[chatId].serviceKey = 'aquasphera';
        bot.editMessageText('🌊 <b>Ендосфера терапія</b>\n\nЯка процедура вас цікавить?\n\n<i>Наприклад: ендосфера, тіло, обличчя...</i>',
            { chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
              reply_markup: {
                  inline_keyboard: [
                      [{ text: '📋 Показати всі', callback_data: 'show_all_aqua' }],
                      [{ text: '🔙 Назад', callback_data: 'massage_type' }]
                  ]
              }
            });
        return;
    }
    
    if (dataCB.startsWith('massage_s_')) {
        const idx = parseInt(dataCB.replace('massage_s_', ''));
        const services = adminsData.services.massage || [];
        const service = services[idx];
        if (!service) return;
        
        if (!userSessions[chatId].selectedZones) {
            userSessions[chatId].selectedZones = [];
        }
        
        const existingIndex = userSessions[chatId].selectedZones.findIndex(z => z.index === idx);
        if (existingIndex === -1) {
            userSessions[chatId].selectedZones.push({ index: idx, name: service.name, price: service.price, time: service.time, altegio_id: service.altegio_id, description: service.description });
        }
        
        userSessions[chatId].serviceKey = 'massage';
        
        const selectedZones = userSessions[chatId].selectedZones;
        let totalPrice = 0;
        
        let msgText = '📍 <b>Обрані процедури:</b>\n\n';
        const keyboard = [];
        
        selectedZones.forEach((z, i) => {
            msgText += `${i + 1}. ${z.name} - ${z.price}\n`;
            totalPrice += parseInt(String(z.price).replace(/\s/g, ''));
            keyboard.push([{ text: `❌ ${z.name}`, callback_data: `massage_remove_${i}` }]);
        });
        
        msgText += `\n💰 <b>Загальна вартість: ${totalPrice} грн</b>`;
        
        keyboard.push([{ text: '➕ Додати ще процедуру', callback_data: 'massage_pick_more' }]);
        keyboard.push([{ text: '✅ Продовжити', callback_data: 'massage_zones_done' }]);
        
        bot.editMessageText(msgText,
            { chat_id: chatId, message_id: messageId, parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } });
        return;
    }
    
    if (dataCB.startsWith('massage_remove_')) {
        const idx = parseInt(dataCB.replace('massage_remove_', ''));
        
        if (userSessions[chatId].selectedZones && userSessions[chatId].selectedZones[idx]) {
            userSessions[chatId].selectedZones.splice(idx, 1);
        }
        
        const selectedZones = userSessions[chatId].selectedZones || [];
        
        if (selectedZones.length === 0) {
            bot.editMessageText('📍 <b>Обрані процедури:</b>\n\nНічого не обрано',
                { chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
                  reply_markup: { inline_keyboard: [[{ text: '➕ Обрати процедури', callback_data: 'massage_pick_more' }]] } });
            return;
        }
        
        let totalPrice = 0;
        let msgText = '📍 <b>Обрані процедури:</b>\n\n';
        const keyboard = [];
        
        selectedZones.forEach((z, i) => {
            msgText += `${i + 1}. ${z.name} - ${z.price}\n`;
            totalPrice += parseInt(String(z.price).replace(/\s/g, ''));
            keyboard.push([{ text: `❌ ${z.name}`, callback_data: `massage_remove_${i}` }]);
        });
        
        msgText += `\n💰 <b>Загальна вартість: ${totalPrice} грн</b>`;
        
        keyboard.push([{ text: '➕ Додати ще процедуру', callback_data: 'massage_pick_more' }]);
        keyboard.push([{ text: '✅ Продовжити', callback_data: 'massage_zones_done' }]);
        
        bot.editMessageText(msgText,
            { chat_id: chatId, message_id: messageId, parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } });
        return;
    }
    
    if (dataCB === 'massage_zones_done') {
        const selectedZones = userSessions[chatId].selectedZones || [];
        let totalPrice = 0;
        
        selectedZones.forEach(z => totalPrice += parseInt(String(z.price).replace(/\s/g, '')));
        
        bot.editMessageText(`💆 <b>Вартість даного комплексу: ${totalPrice} грн</b>\n\nОберіть спеціаліста:`,
            { chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
              reply_markup: {
                  inline_keyboard: [
                      ...(adminsData.categories.massage?.workers || []).map(w => 
                          [{ text: w.name, callback_data: `worker_${w.id}` }]
                      ),
                      [{ text: '🔙 Назад', callback_data: 'massage_zones_done' }]
                  ]
              }
            });
        return;
    }
    
    if (dataCB === 'massage_pick_more') {
        userSessions[chatId].step = 'search_services';
        bot.editMessageText('💆 <b>Масаж</b>\n\nЯкий ще масаж вас цікавить?\n\n<i>Наприклад: антицелюлітний, лімфодренажний, спортивний...</i>',
            { chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
              reply_markup: {
                  inline_keyboard: [
                      [{ text: '📋 Показати всі', callback_data: 'show_all_massage' }],
                      [{ text: '🔙 Назад', callback_data: 'massage_zones_done' }]
                  ]
              }
            });
        return;
    }
    
    if (dataCB === 'show_all_massage') {
        showMassageServices(chatId, messageId);
        return;
    }
    
    // ============ AQUASPHERA CATEGORY ============
    
    if (dataCB === 'cat_aquasphera') {
        userSessions[chatId] = { category: 'aquasphera', serviceKey: 'aquasphera', step: 'search_services' };
        bot.editMessageText('🌊 <b>Ендосфера терапія</b>\n\nЯка процедура вас цікавить?\n\n<i>Наприклад: ендосфера, тіло, обличчя</i>',
            { chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
              reply_markup: {
                  inline_keyboard: [
                      [{ text: '📋 Показати всі', callback_data: 'show_all_aqua' }],
                      [{ text: '🔙 Назад', callback_data: 'start_booking' }]
                  ]
              }
            });
        return;
    }
    
    if (dataCB === 'show_all_aqua') {
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
        
        const { category, serviceIndex, workerId, name, phone, datetime, selectedZones, serviceKey } = session;
        
        if (category === 'laser' && selectedZones && selectedZones.length > 0) {
            const workers = adminsData.categories.laser?.workers || [];
            const worker = workers.find(w => w.id === workerId) || workers[0];
            
            let totalPrice = 0;
            let zonesText = '';
            
            selectedZones.forEach(z => {
                zonesText += `📍 ${z.name} - ${z.price}\n`;
                totalPrice += parseInt(String(z.price).replace(/\s/g, ''));
            });
            
            const serviceIds = selectedZones.map(z => z.altegio_id || 111125);
            const result = await createAltegioBooking(name, phone, serviceIds, worker.altegio_staff_id, datetime);
            
            if (result.success) {
                bot.editMessageText(`✅ <b>Запис створено!</b>\n\n👤 ${name}\n📱 ${phone}\n\n${zonesText}💰 <b>Загальна вартість: ${totalPrice} грн</b>\n👩‍⚕️ ${worker.name}\n🕐 ${datetime}\n\n🎁 Дякуємо за запис! Чекаємо на вас!`,
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
        
        const services = adminsData.services[serviceKey] || [];
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
    } finally {
        releaseLock(chatId);
    }
});

// ==================== MESSAGE HANDLERS ====================

bot.on('message', async (msg) => {
    if (msg.text?.startsWith('/')) return;
    if (msg.text === '/start') return;
    
    const chatId = msg.chat.id;
    const text = msg.text;
    
    if (!userSessions[chatId]) {
        userSessions[chatId] = {};
    }
    
    const session = userSessions[chatId];
    
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
    
    // ============ SEARCH SERVICES ============
    
    if (session.step === 'search_services') {
        const userText = text.toLowerCase();
        const gender = session.gender || 'woman';
        const services = adminsData.services[`laser_${gender}`] || [];
        
        const keywordMap = {
            'пахв': [0, 3], 'підпах': [0, 3],
            'бікіні': [14, 15, 16], 'глибок': [16],
            'ноги': [11, 12], 'ног': [11, 12],
            'стегн': [23], 'гомілк': [10, 11],
            'руки': [6, 7], 'рук': [6, 7],
            'плеч': [1, 6], 'живіт': [5],
            'поперек': [2], 'сідниц': [8, 9],
            'шия': [17], 'обличч': [18, 19, 20, 21, 22],
            'верхня губ': [21, 22], 'губа': [21, 22],
            'підборідд': [20], 'декольт': [4], 'груди': [4]
        };
        
        let matchedIndices = new Set();
        for (const [keyword, indices] of Object.entries(keywordMap)) {
            if (userText.includes(keyword)) {
                indices.forEach(i => matchedIndices.add(i));
            }
        }
        
        const matches = Array.from(matchedIndices).slice(0, 5).map(i => ({
            index: i,
            name: services[i]?.name,
            price: services[i]?.price,
            time: services[i]?.time
        })).filter(m => m.name);
        
        if (matches.length === 0) {
            bot.sendMessage(chatId, '😕 Не знайшли відповідних зон. Оберіть зі списку:',
                { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '📋 Показати всі', callback_data: `laser_pick_${gender}` }]] } });
            return;
        }
        
        let msgText = '🔍 <b>Знайдено:</b>\n\n';
        const keyboard = [];
        
        matches.forEach((m, i) => {
            msgText += `${i + 1}. ${m.name} - ${m.price}\n`;
            keyboard.push([{ text: `${m.name}`, callback_data: `laser_s_${gender}_${m.index}` }]);
        });
        
        keyboard.push([{ text: '📋 Показати всі', callback_data: `laser_pick_${gender}` }]);
        
        bot.sendMessage(chatId, msgText, { parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } });
        session.step = 'laser_service';
        return;
    }
    
    // ============ SEARCH OTHER SERVICES ============
    
    if (session.step === 'search_services' && session.category !== 'laser') {
        const userText = text.toLowerCase();
        const serviceKey = session.serviceKey;
        const services = adminsData.services[serviceKey] || [];
        
        const keywordMaps = {
            cosmetology: {
                'чистк': [0, 1, 2, 3], 'пилінг': [4, 5, 6], 'масаж': [7, 8],
                'обличч': [0, 1, 2, 3, 7, 8], 'спин': [9], 'шия': [10],
                'aquapure': [11], 'hydra': [11]
            },
            massage: {
                'антицелюліт': [0], 'целюліт': [0],
                'підлітк': [1],
                'спортив': [2, 3],
                'лімфодренаж': [4, 5], 'лімф': [4, 5], 'набряк': [4, 5],
                'авторськ': [6], 'секретн': [6],
                'тріо': [7], 'шийно': [7], 'комірцев': [7],
                'масаж': [0, 1, 2, 3, 4, 5, 6, 7]
            },
            aquasphera: {
                'ендосфера': [0, 1], 'тіло': [0, 1], 'обличч': [2],
                'лице': [2], 'комплекс': [3]
            }
        };
        
        const keywordMap = keywordMaps[serviceKey] || {};
        let matchedIndices = new Set();
        
        for (const [keyword, indices] of Object.entries(keywordMap)) {
            if (userText.includes(keyword)) {
                indices.forEach(i => matchedIndices.add(i));
            }
        }
        
        const matches = Array.from(matchedIndices).slice(0, 5).map(i => ({
            index: i,
            name: services[i]?.name,
            price: services[i]?.price,
            time: services[i]?.time
        })).filter(m => m.name);
        
        const callbackMap = { cosmetology: 'cosmo_s_', massage: 'massage_s_', aquasphera: 'aqua_s_' };
        const showAllMap = { cosmetology: 'show_all_cosmo', massage: 'show_all_massage', aquasphera: 'show_all_aqua' };
        
        if (matches.length === 0) {
            bot.sendMessage(chatId, '😕 Не знайшли відповідних процедур. Оберіть зі списку:',
                { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '📋 Показати всі', callback_data: showAllMap[serviceKey] }]] } });
            return;
        }
        
        let msgText = '🔍 <b>Знайдено:</b>\n\n';
        const keyboard = [];
        
        matches.forEach((m, i) => {
            msgText += `${i + 1}. ${m.name} - ${m.price}\n`;
            keyboard.push([{ text: `${m.name}`, callback_data: callbackMap[serviceKey] + m.index }]);
        });
        
        keyboard.push([{ text: '📋 Показати всі', callback_data: showAllMap[serviceKey] }]);
        
        bot.sendMessage(chatId, msgText, { parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } });
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
        
        if (session.category === 'laser' && session.selectedZones && session.selectedZones.length > 0) {
            const selectedZones = session.selectedZones;
            let totalPrice = 0;
            let zonesText = '';
            
            selectedZones.forEach(z => {
                zonesText += `📍 ${z.name} - ${z.price}\n`;
                totalPrice += parseInt(String(z.price).replace(/\s/g, ''));
            });
            
            const workers = adminsData.categories.laser?.workers || [];
            const worker = workers.find(w => w.id === session.workerId) || { name: '?' };
            
            bot.sendMessage(chatId,
                `📋 <b>Перевірте дані:</b>\n\n👤 ${session.name}\n📱 ${session.phone}\n\n${zonesText}💰 <b>Загальна вартість: ${totalPrice} грн</b>\n👩‍⚕️ ${worker.name}\n🕐 ${session.datetime}\n\n✅ <b>Все вірно?</b>`,
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
