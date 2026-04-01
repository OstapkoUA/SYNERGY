const fs = require('fs');
let c = fs.readFileSync('E:/synergy-bot/bot.js', 'utf8');

const start = c.indexOf("if (dataCB === 'massage_exp_yes') {");
const end = c.indexOf("if (dataCB.startsWith('massage_s_'))");

const newBlock = `if (dataCB === 'massage_exp_yes' || dataCB === 'massage_exp_no') {
        userSessions[chatId].step = 'massage_type';
        bot.editMessageText('💆 <b>Масаж</b>\\n\\nЯкий тип масажу вас цікавить?',
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
        bot.editMessageText('💆 <b>Ручний Масаж</b>\\n\\nЯкий масаж вас цікавить?\\n\\n<i>Наприклад: антицелюлітний, лімфодренажний, спортивний...</i>',
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
        bot.editMessageText('🌊 <b>Ендосфера терапія</b>\\n\\nЯка процедура вас цікавить?\\n\\n<i>Наприклад: ендосфера, тіло, обличчя...</i>',
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
    
    `;

c = c.substring(0, start) + newBlock + c.substring(end);
fs.writeFileSync('E:/synergy-bot/bot.js', c, 'utf8');
console.log('Fixed!');
