const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const config = require('./config');

const bot = new TelegramBot(config.BOT_TOKEN, { polling: true });

const { data, adminsData, ALTEGIO_URL, ALTEGIO_API_KEY, ALTEGIO_LOCATION_ID } = config;

// User sessions
const userSessions = {};

// Helper functions
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

function getServicesMenu() {
    const keyboard = data.services.map((cat, i) => 
        [{ text: cat.category, callback_data: `cat_${i}` }]
    );
    keyboard.push([{ text: '🔙 На головну', callback_data: 'back_main' }]);
    return { reply_markup: { inline_keyboard: keyboard } };
}

// Call Gemini API
async function callGemini(prompt) {
    if (!config.GEMINI_API_KEY) return null;
    try {
        const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=${config.GEMINI_API_KEY}`,
            {
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.9, maxOutputTokens: 300 }
            },
            { timeout: 8000 }
        );
        return response.data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
    } catch (e) {
        return null;
    }
}

// Create Altegio booking
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

// Start command
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const welcome = `🏠 <b>S Y N E R G Y</b>\n\n✨ ${data.welcome.subtitle}\n\n${data.welcome.description}`;
    bot.sendMessage(chatId, welcome, { parse_mode: 'HTML', ...getMainMenu() });
});

// Callback queries
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const data = query.data;
    
    await bot.answerCallbackQuery(query.id);

    if (data === 'start_booking') {
        const keyboard = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🔴 Лазерна Епіляція', callback_data: 'ai_category_laser' }],
                    [{ text: '💄 Косметологія', callback_data: 'ai_category_cosmetology' }],
                    [{ text: '💆 Масаж', callback_data: 'ai_category_massage' }],
                    [{ text: '🔙 На головну', callback_data: 'back_main' }]
                ]
            }
        };
        bot.editMessageText('📅 <b>Запис через бот</b>\n\nОберіть категорію послуг:', 
            { chat_id: chatId, message_id: messageId, parse_mode: 'HTML', ...keyboard });
    }
    
    else if (data === 'back_main') {
        const welcome = `🏠 <b>S Y N E R G Y</b>\n\n✨ ${config.data.welcome.subtitle}\n\n${config.data.welcome.description}`;
        bot.editMessageText(welcome, { chat_id: chatId, message_id: messageId, parse_mode: 'HTML', ...getMainMenu() });
    }
    
    else if (data === 'services') {
        bot.editMessageText('💆 <b>Послуги та ціни</b>\n\nОберіть категорію:',
            { chat_id: chatId, message_id: messageId, parse_mode: 'HTML', ...getServicesMenu() });
    }
    
    else if (data.startsWith('cat_')) {
        const catIndex = parseInt(data.split('_')[1]);
        const category = config.data.services[catIndex];
        let text = `<b>${category.category}</b>\n\n`;
        category.items.forEach(item => {
            text += `▫️ <b>${item.name}</b>\n   ⏱ ${item.duration}  |  💰 ${item.price}\n\n`;
        });
        text += '📅 Для запису натисніть /book';
        bot.editMessageText(text, { chat_id: chatId, message_id: messageId, parse_mode: 'HTML', ...getServicesMenu() });
    }
    
    else if (data === 'staff') {
        let text = '👩‍⚕️ <b>Наші спеціалісти</b>\n\n';
        config.data.staff.forEach(member => {
            text += `👤 <b>${member.name}</b>\n   🎓 ${member.role}\n   ✨ ${member.specialty}\n\n`;
        });
        bot.editMessageText(text, { 
            chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
            reply_markup: { inline_keyboard: [[{ text: '🔙 Назад', callback_data: 'back_main' }]] }
        });
    }
    
    else if (data === 'reviews') {
        let text = '⭐ <b>Відгуки наших клієнтів</b>\n\n';
        config.data.reviews.forEach(review => {
            text += `💬 <b>${review.name}</b> — ${review.service}\n   «${review.text}»\n\n`;
        });
        bot.editMessageText(text, { 
            chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
            reply_markup: { inline_keyboard: [[{ text: '🔙 Назад', callback_data: 'back_main' }]] }
        });
    }
    
    else if (data === 'about') {
        bot.editMessageText(`ℹ️ <b>Про SYNERGY</b>\n\n${config.data.welcome.about}`, { 
            chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
            reply_markup: { inline_keyboard: [[{ text: '🔙 Назад', callback_data: 'back_main' }]] }
        });
    }
    
    else if (data === 'contact') {
        const c = config.data.contact;
        const text = `📞 <b>Контакти</b>\n\n📱 Телефон: ${c.phone}\n📍 Адреса: ${c.location}\n📸 Instagram: ${c.instagram}\n🕐 Графік: ${c.working_hours}`;
        bot.editMessageText(text, { 
            chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
            reply_markup: { inline_keyboard: [[{ text: '🔙 Назад', callback_data: 'back_main' }]] }
        });
    }
    
    // AI Booking flow
    else if (data.startsWith('ai_category_')) {
        const category = data.replace('ai_category_', '');
        userSessions[chatId] = { category, step: 'gender', gender: null };
        
        if (category === 'laser') {
            bot.editMessageText('💆 <b>Лазерна Епіляція</b>\n\nВиберіть стать:', {
                chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '👩 Жінка', callback_data: 'ai_gender_woman' }],
                        [{ text: '👨 Чоловік', callback_data: 'ai_gender_man' }],
                        [{ text: '🔙 Назад', callback_data: 'start_booking' }]
                    ]
                }
            });
        } else {
            const question = adminsData.categories[category]?.first_time_question || 'Чудово! Розкажіть, чим можу допомогти?';
            userSessions[chatId].step = 'ask_goals';
            bot.editMessageText(`<b>${category.toUpperCase()}</b>\n\n${question}`, {
                chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '✅ Так', callback_data: `ai_yes_${category}` }],
                        [{ text: '❌ Ні', callback_data: `ai_no_${category}` }],
                        [{ text: '🔙 Назад', callback_data: 'start_booking' }]
                    ]
                }
            });
        }
    }
    
    else if (data.startsWith('ai_gender_')) {
        const gender = data.replace('ai_gender_', '');
        userSessions[chatId] = { category: 'laser', step: 'laser_experience', gender };
        
        bot.editMessageText('💆 <b>Лазерна Епіляція</b>\n\nЧудово! Допоможу вам із записом.\n\nСкажіть, ви колись робили лазерну епіляцію?', {
            chat_id: chatId, message_id: messageId, parse_mode: 'HTML'
        });
    }
    
    else if (data.startsWith('ai_yes_') || data === 'ai_yes') {
        const category = data.replace('ai_yes_', '') || userSessions[chatId]?.category;
        
        if (category === 'laser') {
            userSessions[chatId].step = 'gender';
            bot.editMessageText('💆 <b>Лазерна Епіляція</b>\n\nВиберіть стать:', {
                chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '👩 Жінка', callback_data: 'ai_gender_woman' }],
                        [{ text: '👨 Чоловік', callback_data: 'ai_gender_man' }]
                    ]
                }
            });
        } else {
            userSessions[chatId].step = 'choose_service';
            showServices(chatId, messageId, category);
        }
    }
    
    else if (data.startsWith('ai_no_') || data === 'ai_no') {
        const category = data.replace('ai_no_', '') || userSessions[chatId]?.category;
        const explanationKey = adminsData.categories[category]?.first_time_explanation;
        const explanation = adminsData.explanations[explanationKey] || 'Інформація готується...';
        
        bot.editMessageText(`📝 <b>Що таке ${explanationKey}?</b>\n\n${explanation}`, {
            chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'Продовжити', callback_data: 'ai_continue' }],
                    [{ text: 'На головну', callback_data: 'back_main' }]
                ]
            }
        });
    }
    
    else if (data === 'ai_continue') {
        const session = userSessions[chatId];
        if (session?.category === 'laser') {
            userSessions[chatId].step = 'gender';
            bot.editMessageText('💆 <b>Лазерна Епіляція</b>\n\nВиберіть стать:', {
                chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '👩 Жінка', callback_data: 'ai_gender_woman' }],
                        [{ text: '👨 Чоловік', callback_data: 'ai_gender_man' }]
                    ]
                }
            });
        } else {
            showServices(chatId, messageId, userSessions[chatId]?.category);
        }
    }
    
    else if (data.startsWith('ai_service_')) {
        const [_, __, category, idx] = data.split('_');
        const serviceIndex = parseInt(idx);
        
        const serviceKey = category === 'laser' 
            ? `laser_${userSessions[chatId]?.gender || 'woman'}`
            : category;
        const services = adminsData.services[serviceKey] || [];
        const service = services[serviceIndex];
        
        if (service?.unavailable) {
            bot.editMessageText(`⚠️ <b>Послуга тимчасово недоступна</b>\n\nПослуга «${service.name}» наразі недоступна.\nБудь ласка, оберіть іншу послугу.`, {
                chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
                reply_markup: { inline_keyboard: [[{ text: '🔙 Назад', callback_data: `ai_back_services_${category}` }]] }
            });
            return;
        }
        
        userSessions[chatId].serviceIndex = serviceIndex;
        userSessions[chatId].step = 'choose_worker';
        
        showWorkers(chatId, messageId, category);
    }
    
    else if (data.startsWith('ai_worker_')) {
        const workerId = parseInt(data.replace('ai_worker_', ''));
        userSessions[chatId].workerId = workerId;
        userSessions[chatId].step = 'enter_name';
        
        bot.editMessageText('Введіть ваше <b>ПІБ</b> (повністю):', {
            chat_id: chatId, message_id: messageId, parse_mode: 'HTML'
        });
    }
    
    else if (data === 'ai_confirm_booking') {
        await handleBookingConfirmation(chatId, messageId);
    }
});

function showServices(chatId, messageId, category) {
    const serviceKey = category === 'laser' 
        ? `laser_${userSessions[chatId]?.gender || 'woman'}`
        : category;
    const services = adminsData.services[serviceKey] || [];
    
    const keyboard = services.map((s, i) => 
        [{ text: `${s.name} - ${s.price}`, callback_data: `ai_service_${category}_${i}` }]
    );
    keyboard.push([{ text: '🔙 Назад', callback_data: 'start_booking' }]);
    
    bot.editMessageText('Оберіть послугу:', {
        chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
        reply_markup: { inline_keyboard: keyboard }
    });
}

function showWorkers(chatId, messageId, category) {
    const workers = adminsData.categories[category]?.workers || [];
    
    const keyboard = workers.map(w => 
        [{ text: `${w.name} - ${w.role}`, callback_data: `ai_worker_${w.id}` }]
    );
    keyboard.push([{ text: '🔙 Назад', callback_data: 'ai_back_first_q' }]);
    
    bot.editMessageText('Оберіть спеціаліста:', {
        chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
        reply_markup: { inline_keyboard: keyboard }
    });
}

async function handleBookingConfirmation(chatId, messageId) {
    const session = userSessions[chatId];
    if (!session) return;
    
    const { category, serviceIndex, workerId, name, phone, datetime } = session;
    
    const serviceKey = category === 'laser' 
        ? `laser_${session.gender || 'woman'}`
        : category;
    const services = adminsData.services[serviceKey] || [];
    const workers = adminsData.categories[category]?.workers || [];
    
    const service = services[serviceIndex] || { name: 'Консультація', alteg: 123456 };
    const worker = workers.find(w => w.id === workerId) || workers[0];
    
    const serviceId = service.altegio_id || 123456;
    const staffId = worker.altegio_staff_id || 1;
    
    const result = await createAltegioBooking(name, phone, serviceId, staffId, datetime);
    
    if (result.success) {
        bot.editMessageText(
            `✅ <b>Запис успішно створено!</b>\n\n👤 ${name}\n📱 ${phone}\n💆 ${service.name}\n👩‍⚕️ ${worker.name}\n🕐 ${datetime}\n\nМи чекаємо на вас у студії SYNERGY!`, 
            { chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
              reply_markup: { inline_keyboard: [[{ text: '🏠 Головне меню', callback_data: 'back_main' }]] } }
        );
    } else {
        bot.editMessageText(
            `⚠️ <b>Помилка запису</b>\n\nПомилка: ${result.error}\n\nБудь ласка, зв'яжіться з нами:`, 
            { chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
              reply_markup: { inline_keyboard: [[{ text: '📞 Зателефонувати', url: 'https://t.me/synergy_lviv' }]] } }
        );
    }
    
    delete userSessions[chatId];
}

// Handle text messages (conversation flow)
bot.on('message', async (msg) => {
    if (msg.text && msg.text.startsWith('/')) return;
    if (msg.text === '/start' || msg.text === '/book') return;
    
    const chatId = msg.chat.id;
    const text = msg.text;
    const session = userSessions[chatId];
    
    if (!session || !session.step) return;
    
    if (session.step === 'ask_goals') {
        session.step = 'choose_service';
        
        const responses = {
            cosmetology: 'Чудово, що звернулися! Наш косметолог Ілона допоможе вам підібрати ідеальну процедуру.',
            massage: 'Чудово, що звернулися! Наш масажист Владислав підбере найкращу техніку.',
            aquasphera: 'Чудово, що звернулися! Ендосфера терапія - відмінний вибір!'
        };
        
        bot.sendMessage(chatId, `${responses[session.category] || 'Чудово!'}\n\nОберіть послугу:`, {
            parse_mode: 'HTML', ...getServicesForCategory(session.category)
        });
    }
    
    else if (session.step === 'laser_experience') {
        const lower = text.toLowerCase();
        
        if (lower.includes('так') || lower.includes('робила') || lower.includes('робив')) {
            session.step = 'for_self_or_gift';
            bot.sendMessage(chatId, 'Підкажіть, ви для себе обираєте чи в подарунок?', {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: 'Для себе', callback_data: 'ai_for_self' }],
                        [{ text: 'В подарунок', callback_data: 'ai_for_gift' }]
                    ]
                }
            });
        } else {
            session.step = 'first_time_explained';
            bot.sendMessage(chatId, 'Лазерна епіляція - це ефективний спосіб позбутися небажаного волосся надовго. Наш олександритовий лазер DEKA Moveo працює швидко, безболісно та підходить для всіх типів шкіри.\n\nБажаєте продовжити запис?', {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: 'Продовжити', callback_data: 'ai_continue' }],
                        [{ text: 'На головну', callback_data: 'back_main' }]
                    ]
                }
            });
        }
    }
    
    else if (session.step === 'enter_name') {
        session.name = text;
        session.step = 'enter_phone';
        bot.sendMessage(chatId, 'Введіть ваш <b>номер телефону</b>:', { parse_mode: 'HTML' });
    }
    
    else if (session.step === 'enter_phone') {
        session.phone = text;
        session.step = 'enter_datetime';
        bot.sendMessage(chatId, 'Введіть зручну дату та час для запису:\n(Наприклад: 15.04.2026 о 14:00)');
    }
    
    else if (session.step === 'enter_datetime') {
        session.datetime = text;
        
        const serviceKey = session.category === 'laser' 
            ? `laser_${session.gender || 'woman'}`
            : session.category;
        const services = adminsData.services[serviceKey] || [];
        const workers = adminsData.categories[session.category]?.workers || [];
        
        const service = services[session.serviceIndex] || { name: 'Консультація' };
        const worker = workers.find(w => w.id === session.workerId) || workers[0];
        
        const summary = `📋 <b>Перевірте ваші дані:</b>\n\n👤 Ім'я: <b>${session.name}</b>\n📱 Телефон: <b>${session.phone}</b>\n💆 Послуга: <b>${service.name}</b>\n👩‍⚕️ Спеціаліст: <b>${worker.name}</b>\n🕐 Дата/час: <b>${session.datetime}</b>\n\nВсе вірно?`;
        
        bot.sendMessage(chatId, summary, {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '✅ Підтвердити', callback_data: 'ai_confirm_booking' }],
                    [{ text: '❌ Відмінити', callback_data: 'back_main' }]
                ]
            }
        });
    }
});

function getServicesForCategory(category) {
    const serviceKey = category;
    const services = adminsData.services[serviceKey] || [];
    
    const keyboard = services.map((s, i) => 
        [{ text: `${s.name} - ${s.price}`, callback_data: `ai_service_${category}_${i}` }]
    );
    keyboard.push([{ text: '🔙 Назад', callback_data: 'start_booking' }]);
    
    return { reply_markup: { inline_keyboard: keyboard } };
}

console.log('SYNERGY Bot started!');
