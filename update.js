const fs = require('fs');
const path = require('path');

const BOT_FILE = 'bot.js';
const BACKUP_FILE = 'bot.js.bak';

function updateBot() {
    let code = fs.readFileSync(BOT_FILE, 'utf8');
    
    const searchFuncs = `

function searchServicesAI(query, serviceKey) {
    const services = adminsData.services[serviceKey] || [];
    if (services.length === 0) return Promise.resolve([]);
    
    const serviceNames = services.map(s => s.name).join('\\n- ');
    const prompt = \`Користувач хоче: "\${query}". 
Знайди найкращі послуги з цього списку:
- \${serviceNames}
Відповідь JSON масивом індексів (до 5), например: [0,3,5]
Тільки JSON, без текста.\`;

    return callGemini(prompt).then(response => {
        try {
            const text = response || '';
            const indices = JSON.parse(text.replace(/[^\\[\\]0-9,]/g, ''));
            return indices.filter(i => i >= 0 && i < services.length).map(i => ({ service: services[i], idx: i, score: 10 }));
        } catch (e) {
            return fallbackSearch(query, services);
        }
    }).catch(() => fallbackSearch(query, services));
}

function fallbackSearch(query, services) {
    const lowerQuery = query.toLowerCase().trim();
    const keywords = lowerQuery.split(/[\\s,]+/).filter(w => w.length > 1);
    return services.map((s, idx) => {
        const name = s.name.toLowerCase();
        let score = 0;
        if (name.includes(lowerQuery)) score += 10;
        for (const kw of keywords) { if (name.includes(kw)) score += 5; }
        return { service: s, idx, score };
    }).filter(m => m.score > 0).sort((a, b) => b.score - a.score).slice(0, 8);
}

function showSearchResults(chatId, results, serviceKey) {
    const keyboard = results.slice(0, 8).map(r => 
        [{ text: r.service.name + ' - ' + r.service.price, callback_data: 'svc_' + serviceKey + '_' + r.idx }]
    );
    keyboard.push([{ text: '📋 Показати всі', callback_data: 'show_all' }]);
    keyboard.push([{ text: '🔍 Новий пошук', callback_data: 'new_search' }]);
    keyboard.push([{ text: '❓ Задати питання', callback_data: 'ask_ai' }]);
    const msg = results.length > 0 ? '🔍 Знайдено:\\n\\nОберіть процедуру:' : '❌ Нічого не знайдено.\\n\\nСпробуйте інший запит:';
    try { bot.sendMessage(chatId, msg, { parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } }); }
    catch (e) { console.log('Error:', e.message); }
}

function showAllServices(chatId, serviceKey) {
    const services = adminsData.services[serviceKey] || [];
    const keyboard = services.slice(0, 10).map((s, i) => 
        [{ text: s.name + ' - ' + s.price, callback_data: 'svc_' + serviceKey + '_' + i }]
    );
    if (services.length > 10) keyboard.push([{ text: '📋 Ще', callback_data: 'more_' + serviceKey + '_10' }]);
    keyboard.push([{ text: '🔍 Пошук', callback_data: 'new_search' }]);
    keyboard.push([{ text: '❓ Задати питання', callback_data: 'ask_ai' }]);
    const categoryNames = { laser_woman: '💆 Лазерна Епіляція', laser_man: '💆 Лазерна Епіляція', cosmetology: '💄 Косметологія', massage: '💆 Масаж', aquasphera: '🌊 Ендосфера' };
    const msg = (categoryNames[serviceKey] || 'Послуги') + '\\n\\nОберіть процедуру:';
    try { bot.sendMessage(chatId, msg, { parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } }); }
    catch (e) { console.log('Error:', e.message); }
}

function askForService(chatId, serviceKey) {
    const categoryNames = { laser_woman: '💆 Лазерна Епіляція', laser_man: '💆 Лазерна Епіляція', cosmetology: '💄 Косметологія', massage: '💆 Масаж', aquasphera: '🌊 Ендосфера' };
    const catName = categoryNames[serviceKey] || 'Послуги';
    try {
        bot.sendMessage(chatId, catName + '\\n\\nНа яких ділянках хотіли б зробити процедуру?\\n<i>Наприклад: пахви, бікіні, ноги...</i>', 
            { parse_mode: 'HTML', reply_markup: { inline_keyboard: [
                [{ text: '📋 Показати всі', callback_data: 'show_all' }],
                [{ text: '❓ Задати питання', callback_data: 'ask_ai' }],
                [{ text: '🔙 Назад', callback_data: 'start_booking' }]
            ]}});
    } catch (e) { console.log('Error:', e.message); }
}

`;

    code = code.replace('// ==================== COMMAND HANDLERS', searchFuncs + '// ==================== COMMAND HANDLERS');

    // laser_woman/laser_man
    code = code.replace(
        "if (dataCB === 'laser_woman' || dataCB === 'laser_man') {\n        const gender = dataCB.replace('laser_', '');\n        userSessions[chatId].gender = gender;\n        userSessions[chatId].step = 'laser_service';\n        showLaserServices(chatId, messageId, gender);\n        return;\n    }",
        "if (dataCB === 'laser_woman' || dataCB === 'laser_man') {\n        const gender = dataCB.replace('laser_', '');\n        userSessions[chatId].gender = gender;\n        userSessions[chatId].serviceKey = 'laser_' + gender;\n        userSessions[chatId].step = 'search_services';\n        askForService(chatId, 'laser_' + gender);\n        return;\n    }"
    );

    // search message handler
    code = code.replace(
        "// ============ LASER TYPE QUESTION (user types diode or alex) ============",
        `// ============ SEARCH SERVICES ============
    if (session.step === 'search_services') {
        searchServicesAI(text, session.serviceKey).then(results => {
            showSearchResults(chatId, results, session.serviceKey);
        });
        return;
    }
    
    // ============ LASER TYPE QUESTION (user types diode or alex) ============`
    );

    // show_all, new_search, svc_ handlers
    code = code.replace(
        "// ============ LASER CATEGORY ============",
        `// ============ SEARCH & SERVICES ============
    if (dataCB === 'show_all') {
        showAllServices(chatId, session?.serviceKey || 'laser_woman');
        return;
    }
    
    if (dataCB === 'new_search') {
        session.step = 'search_services';
        askForService(chatId, session.serviceKey);
        return;
    }
    
    if (dataCB.startsWith('svc_')) {
        const parts = dataCB.split('_');
        const serviceKey = parts[1];
        const idx = parseInt(parts[2]);
        const services = adminsData.services[serviceKey] || [];
        const service = services[idx];
        if (!service) return;
        userSessions[chatId].serviceIndex = idx;
        userSessions[chatId].serviceKey = serviceKey;
        userSessions[chatId].step = 'laser_worker';
        const category = serviceKey.startsWith('laser') ? 'laser' : serviceKey;
        const workers = adminsData.categories[category]?.workers || [];
        const keyboard = workers.map(w => [{ text: w.name, callback_data: 'worker_' + w.id }]);
        keyboard.push([{ text: '❓ Задати питання', callback_data: 'ask_ai' }]);
        keyboard.push([{ text: '🔙 Інша процедура', callback_data: 'new_search' }]);
        bot.editMessageText('✅ <b>' + service.name + '</b>\\n💰 ' + service.price + '\\n⏱ ' + service.time + '\\n\\nОберіть спеціаліста:', { chat_id: chatId, message_id: messageId, parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } });
        return;
    }
    
    // ============ LASER CATEGORY ============`
    );

    // cosmetology
    code = code.replace(
        "if (dataCB === 'cat_cosmetology') {\n        userSessions[chatId] = { category: 'cosmetology', step: 'cosmetology_service' };\n        showCosmetologyServices(chatId, messageId);\n        return;\n    }",
        "if (dataCB === 'cat_cosmetology') {\n        userSessions[chatId] = { category: 'cosmetology', serviceKey: 'cosmetology', step: 'search_services' };\n        askForService(chatId, 'cosmetology');\n        return;\n    }"
    );

    // massage
    code = code.replace(
        "if (dataCB === 'cat_massage') {\n        userSessions[chatId] = { category: 'massage', step: 'massage_service' };\n        showMassageServices(chatId, messageId);\n        return;\n    }",
        "if (dataCB === 'cat_massage') {\n        userSessions[chatId] = { category: 'massage', serviceKey: 'massage', step: 'search_services' };\n        askForService(chatId, 'massage');\n        return;\n    }"
    );

    // aquasphera
    code = code.replace(
        "if (dataCB === 'cat_aquasphera') {\n        userSessions[chatId] = { category: 'aquasphera', step: 'aquasphera_service' };\n        showAquaspheraServices(chatId, messageId);\n        return;\n    }",
        "if (dataCB === 'cat_aquasphera') {\n        userSessions[chatId] = { category: 'aquasphera', serviceKey: 'aquasphera', step: 'search_services' };\n        askForService(chatId, 'aquasphera');\n        return;\n    }"
    );

    // Write updated code
    fs.writeFileSync(BOT_FILE, code, 'utf8');
    console.log('✅ bot.js updated successfully!');
}

updateBot();