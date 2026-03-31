const fs = require('fs');
let c = fs.readFileSync('E:/synergy-bot/bot.js', 'utf8');

const laserStart = c.indexOf('    // ============ LASER CATEGORY ============');
const laserEnd = c.indexOf('    // ============ COSMETOLOGY CATEGORY ============');

const newLaser = `    // ============ LASER CATEGORY ============
    
    if (dataCB === 'cat_laser') {
        userSessions[chatId] = { category: 'laser', step: 'laser_offer' };
        bot.editMessageText('💆 <b>Лазерна Епіляція</b>\\n\\nВас зацікавила наша спеціальна пропозиція на лазерну епіляцію?',
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
        bot.editMessageText('💆 <b>Лазерна Епіляція</b>\\n\\nПідкажіть, ви для себе обираєте чи в подарунок?',
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
        bot.editMessageText('💆 <b>Лазерна Епіляція</b>\\n\\nЧи робили Ви раніше лазерну епіляцію на олександритовому лазері чи це ваш перший досвід?',
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
        bot.editMessageText('💆 <b>Лазерна Епіляція</b>\\n\\nНа якому лазері робили?',
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
        bot.editMessageText('💆 <b>Лазерна Епіляція</b>\\n\\nРозуміємо! Результат залежить від апарату, правильно підібраних параметрів та індивідуальних особливостей.\\n\\nНаш олександритовий DEKA Moveo дає кращий результат:\\n• Швидший ефект\\n• Менше процедур\\n• Безболісний\\n\\nОберіть стать:',
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
        bot.editMessageText('💆 <b>Лазерна Епіляція</b>\\n\\nЧудово! Ви вже знаєте переваги олександритового лазера!\\n\\nОберіть стать:',
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
        bot.editMessageText('💆 <b>Лазерна Епіляція</b>\\n\\nЧудово! Ми працюємо на олександритовому італійському лазері DEKA Moveo - процедури безболісні та ефективні. 99% клієнтів обирають його, бо втомились терпіти біль!\\n\\nОберіть стать:',
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
        userSessions[chatId].serviceKey = \`laser_\${gender}\`;
        userSessions[chatId].step = 'search_services';
        
        bot.editMessageText('💆 <b>Лазерна Епіляція</b>\\n\\nПідкажіть, на яких ділянках ви бажаєте проводити епіляцію?\\n\\n<i>Наприклад: ноги, пахви, бікіні...</i>',
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
        
        const services = adminsData.services[\`laser_\${gender}\`] || [];
        const service = services[idx];
        if (!service) return;
        
        if (!userSessions[chatId].selectedZones) {
            userSessions[chatId].selectedZones = [];
        }
        
        const existingIndex = userSessions[chatId].selectedZones.findIndex(z => z.index === idx);
        if (existingIndex === -1) {
            userSessions[chatId].selectedZones.push({ index: idx, name: service.name, price: service.price, time: service.time });
        }
        
        userSessions[chatId].serviceKey = \`laser_\${gender}\`;
        
        const selectedZones = userSessions[chatId].selectedZones;
        let totalPrice = 0;
        let totalTime = 0;
        
        let msgText = '📍 <b>Обрані зони:</b>\\n\\n';
        const keyboard = [];
        
        selectedZones.forEach((z, i) => {
            msgText += \`\${i + 1}. \${z.name} - \${z.price}\\n\`;
            totalPrice += parseInt(String(z.price).replace(/\\s/g, ''));
            totalTime += parseInt(z.time);
            keyboard.push([{ text: \`❌ \${z.name}\`, callback_data: \`laser_remove_\${gender}_\${i}\` }]);
        });
        
        const hours = Math.floor(totalTime / 60);
        const mins = totalTime % 60;
        const timeStr = hours > 0 ? \`\${hours} год \${mins} хв\` : \`\${mins} хв\`;
        
        msgText += \`\\n💰 <b>Загальна вартість: \${totalPrice} грн</b>\\n⏱ Тривалість: \${timeStr}\`;
        
        keyboard.push([{ text: '➕ Додати ще зону', callback_data: \`laser_pick_\${gender}\` }]);
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
            bot.editMessageText('📍 <b>Обрані зони:</b>\\n\\nНічого не обрано',
                { chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
                  reply_markup: { inline_keyboard: [[{ text: '➕ Обрати зони', callback_data: \`laser_pick_\${gender}\` }]] } });
            return;
        }
        
        let totalPrice = 0;
        let totalTime = 0;
        let msgText = '📍 <b>Обрані зони:</b>\\n\\n';
        const keyboard = [];
        
        selectedZones.forEach((z, i) => {
            msgText += \`\${i + 1}. \${z.name} - \${z.price}\\n\`;
            totalPrice += parseInt(String(z.price).replace(/\\s/g, ''));
            totalTime += parseInt(z.time);
            keyboard.push([{ text: \`❌ \${z.name}\`, callback_data: \`laser_remove_\${gender}_\${i}\` }]);
        });
        
        const hours = Math.floor(totalTime / 60);
        const mins = totalTime % 60;
        const timeStr = hours > 0 ? \`\${hours} год \${mins} хв\` : \`\${mins} хв\`;
        
        msgText += \`\\n💰 <b>Загальна вартість: \${totalPrice} грн</b>\\n⏱ Тривалість: \${timeStr}\`;
        
        keyboard.push([{ text: '➕ Додати ще зону', callback_data: \`laser_pick_\${gender}\` }]);
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
            totalPrice += parseInt(String(z.price).replace(/\\s/g, ''));
            totalTime += parseInt(z.time);
        });
        
        const hours = Math.floor(totalTime / 60);
        const mins = totalTime % 60;
        const timeStr = hours > 0 ? \`\${hours} год \${mins} хв\` : \`\${mins} хв\`;
        
        bot.editMessageText(\`💆 <b>Вартість даного комплексу: \${totalPrice} грн</b>\\n⏱ Тривалість: \${timeStr}\\n\\nЗазвичай до цих ділянок додають ще руки до ліктя або верхню губу. Забронувати для вас додатковий час на ці ділянки?\`,
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
        const services = adminsData.services[\`laser_\${gender}\`] || [];
        const armsService = services[armsIdx];
        
        if (armsService && !userSessions[chatId].selectedZones.find(z => z.index === armsIdx)) {
            userSessions[chatId].selectedZones.push({ index: armsIdx, name: armsService.name, price: armsService.price, time: armsService.time });
        }
        
        const selectedZones = userSessions[chatId].selectedZones || [];
        let totalPrice = 0;
        selectedZones.forEach(z => totalPrice += parseInt(String(z.price).replace(/\\s/g, '')));
        
        bot.editMessageText(\`✅ Додано: \${armsService?.name || 'Руки'}\\n\\n💰 <b>Загальна вартість: \${totalPrice} грн</b>\\n\\nОберіть спеціаліста:\`,
            { chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
              reply_markup: {
                  inline_keyboard: [
                      ...(adminsData.categories.laser?.workers || []).map(w => 
                          [{ text: w.name, callback_data: \`worker_\${w.id}\` }]
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
        const services = adminsData.services[\`laser_\${gender}\`] || [];
        const lipsService = services[lipsIdx];
        
        if (lipsService && !userSessions[chatId].selectedZones.find(z => z.index === lipsIdx)) {
            userSessions[chatId].selectedZones.push({ index: lipsIdx, name: lipsService.name, price: lipsService.price, time: lipsService.time });
        }
        
        const selectedZones = userSessions[chatId].selectedZones || [];
        let totalPrice = 0;
        selectedZones.forEach(z => totalPrice += parseInt(String(z.price).replace(/\\s/g, '')));
        
        bot.editMessageText(\`✅ Додано: \${lipsService?.name || 'Верхня губа'}\\n\\n💰 <b>Загальна вартість: \${totalPrice} грн</b>\\n\\nОберіть спеціаліста:\`,
            { chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
              reply_markup: {
                  inline_keyboard: [
                      ...(adminsData.categories.laser?.workers || []).map(w => 
                          [{ text: w.name, callback_data: \`worker_\${w.id}\` }]
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
        selectedZones.forEach(z => totalPrice += parseInt(String(z.price).replace(/\\s/g, '')));
        
        bot.editMessageText(\`💰 <b>Вартість: \${totalPrice} грн</b>\\n\\nПри оплаті сьогодні у подарунок отримаєте тканинну маску для обличчя! 🎁\\n\\nОберіть спеціаліста:\`,
            { chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
              reply_markup: {
                  inline_keyboard: [
                      ...(adminsData.categories.laser?.workers || []).map(w => 
                          [{ text: w.name, callback_data: \`worker_\${w.id}\` }]
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
    
`;

c = c.substring(0, laserStart) + newLaser + c.substring(laserEnd);
fs.writeFileSync('E:/synergy-bot/bot.js', c, 'utf8');
console.log('Laser flow rewritten!');
