const fs = require('fs');
let c = fs.readFileSync('E:/synergy-bot/bot.js', 'utf8');

const oldReviews = `    if (dataCB === 'reviews') {
        let text = '⭐ <b>Відгуки</b>\\n\\n';
        data.reviews.forEach(r => {
            text += \`💬 <b>\${r.name}</b> — \${r.service}\\n   «\${r.text}»\\n\\n\`;
        });
        bot.editMessageText(text, { chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
            reply_markup: { inline_keyboard: [[{ text: '🔙 Назад', callback_data: 'back_main' }]] } });
        return;
    }`;

const newReviews = `    if (dataCB === 'reviews') {
        bot.editMessageText('⏳ Завантажуємо відгуки з Google Maps...', 
            { chat_id: chatId, message_id: messageId, parse_mode: 'HTML' });
        
        const reviews = await fetchGoogleReviews();
        
        let text = '⭐ <b>Відгуки з Google Maps</b>\\n\\n';
        reviews.slice(0, 10).forEach(r => {
            const stars = '⭐'.repeat(r.rating || 5);
            text += \`💬 <b>\${r.name}</b> \${stars}\\n   «\${r.text}»\\n\\n\`;
        });
        text += '🔗 <a href="https://g.page/synergy-lviv">Більше відгуків на Google Maps</a>';
        
        bot.editMessageText(text, { chat_id: chatId, message_id: messageId, parse_mode: 'HTML',
            reply_markup: { inline_keyboard: [[{ text: '🔙 Назад', callback_data: 'back_main' }]] } });
        return;
    }`;

if (c.includes(oldReviews)) {
    c = c.replace(oldReviews, newReviews);
    fs.writeFileSync('E:/synergy-bot/bot.js', c, 'utf8');
    console.log('Reviews handler updated!');
} else {
    console.log('Old reviews block not found, trying regex...');
    const regex = /if \(dataCB === 'reviews'\) \{[\s\S]*?return;\s*\}/;
    const match = c.match(regex);
    if (match) {
        c = c.replace(regex, newReviews);
        fs.writeFileSync('E:/synergy-bot/bot.js', c, 'utf8');
        console.log('Reviews handler updated via regex!');
    } else {
        console.log('Could not find reviews handler');
    }
}
