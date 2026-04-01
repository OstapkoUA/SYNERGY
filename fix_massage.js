const fs = require('fs');
let c = fs.readFileSync('E:/synergy-bot/bot.js', 'utf8');

const massageStart = c.indexOf('    // ============ MASSAGE CATEGORY ============');
const massageEnd = c.indexOf('    // ============ AQUASPHERA CATEGORY ============');

const newMassage = `    // ============ MASSAGE CATEGORY ============
    
    if (dataCB === 'cat_massage') {
        userSessions[chatId] = { category: 'massage', step: 'massage_offer' };
        bot.editMessageText('💆 <b>Масаж</b>\\n\\nВас зацікавила наша спеціальна пропозиція на масаж?',
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
        bot.editMessageText('💆 <b>Масаж</b>\\n\\nЧи робили Ви раніше масаж?',
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
    
    if (dataCB === 'massage_exp_yes') {
        userSessions[chatId].step = 'search_services';
        bot.editMessageText('💆 <b>Масаж</b>\\n\\nЧудово! Ви вже знаєте переваги масажу!\\n\\nЯкий масаж вас цікавить?\\n\\n<i>Наприклад: антицелюлітний, лімфодренажний, спортивний...</i>',
            { chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
              reply_markup: {
                  inline_keyboard: [
                      [{ text: '📋 Показати всі', callback_data: 'show_all_massage' }],
                      [{ text: '🔙 Назад', callback_data: 'massage_offer_yes' }]
                  ]
              }
            });
        return;
    }
    
    if (dataCB === 'massage_exp_no') {
        userSessions[chatId].step = 'search_services';
        bot.editMessageText('💆 <b>Масаж</b>\\n\\nЧудово! Масаж - це не лише приємна процедура, а й потужний інструмент для здоров\'я:\\n\\n• Знімає напругу та стрес\\n• Покращує кровообіг\\n• Допомагає при набряках\\n• Робить шкіру пружнішою\\n\\nЯкий масаж вас цікавить?\\n\\n<i>Наприклад: антицелюлітний, лімфодренажний, спортивний...</i>',
            { chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
              reply_markup: {
                  inline_keyboard: [
                      [{ text: '📋 Показати всі', callback_data: 'show_all_massage' }],
                      [{ text: '🔙 Назад', callback_data: 'massage_offer_yes' }]
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
        
        let msgText = '📍 <b>Обрані процедури:</b>\\n\\n';
        const keyboard = [];
        
        selectedZones.forEach((z, i) => {
            msgText += \`\${i + 1}. \${z.name} - \${z.price}\\n\`;
            totalPrice += parseInt(String(z.price).replace(/\\s/g, ''));
            keyboard.push([{ text: \`❌ \${z.name}\`, callback_data: \`massage_remove_\${i}\` }]);
        });
        
        msgText += \`\\n💰 <b>Загальна вартість: \${totalPrice} грн</b>\`;
        
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
            bot.editMessageText('📍 <b>Обрані процедури:</b>\\n\\nНічого не обрано',
                { chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
                  reply_markup: { inline_keyboard: [[{ text: '➕ Обрати процедури', callback_data: 'massage_pick_more' }]] } });
            return;
        }
        
        let totalPrice = 0;
        let msgText = '📍 <b>Обрані процедури:</b>\\n\\n';
        const keyboard = [];
        
        selectedZones.forEach((z, i) => {
            msgText += \`\${i + 1}. \${z.name} - \${z.price}\\n\`;
            totalPrice += parseInt(String(z.price).replace(/\\s/g, ''));
            keyboard.push([{ text: \`❌ \${z.name}\`, callback_data: \`massage_remove_\${i}\` }]);
        });
        
        msgText += \`\\n💰 <b>Загальна вартість: \${totalPrice} грн</b>\`;
        
        keyboard.push([{ text: '➕ Додати ще процедуру', callback_data: 'massage_pick_more' }]);
        keyboard.push([{ text: '✅ Продовжити', callback_data: 'massage_zones_done' }]);
        
        bot.editMessageText(msgText,
            { chat_id: chatId, message_id: messageId, parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } });
        return;
    }
    
    if (dataCB === 'massage_zones_done') {
        const selectedZones = userSessions[chatId].selectedZones || [];
        let totalPrice = 0;
        
        selectedZones.forEach(z => totalPrice += parseInt(String(z.price).replace(/\\s/g, '')));
        
        bot.editMessageText(\`💆 <b>Вартість даного комплексу: \${totalPrice} грн</b>\\n\\nОберіть спеціаліста:\`,
            { chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
              reply_markup: {
                  inline_keyboard: [
                      ...(adminsData.categories.massage?.workers || []).map(w => 
                          [{ text: w.name, callback_data: \`worker_\${w.id}\` }]
                      ),
                      [{ text: '🔙 Назад', callback_data: 'massage_zones_done' }]
                  ]
              }
            });
        return;
    }
    
    if (dataCB === 'massage_pick_more') {
        userSessions[chatId].step = 'search_services';
        bot.editMessageText('💆 <b>Масаж</b>\\n\\nЯкий ще масаж вас цікавить?\\n\\n<i>Наприклад: антицелюлітний, лімфодренажний, спортивний...</i>',
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
    
`;

c = c.substring(0, massageStart) + newMassage + c.substring(massageEnd);
fs.writeFileSync('E:/synergy-bot/bot.js', c, 'utf8');
console.log('Massage flow rewritten!');
