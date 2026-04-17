const express = require('express');
const path = require('path');
const https = require('https');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json());

const token = process.env.TELEGRAM_BOT_TOKEN;
const masterChatId = process.env.TELEGRAM_CHAT_ID;

// ПРЕМИУМ ОТПРАВКА (С ПОДДЕРЖКОЙ КНОПОК И ОЖИДАНИЕМ)
function sendMsg(cid, text, markup = null) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify({
            chat_id: cid, text, parse_mode: 'Markdown', reply_markup: markup
        });
        const options = {
            hostname: 'api.telegram.org', port: 443,
            path: `/bot${token}/sendMessage`, method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
        };
        const req = https.request(options, (res) => {
            res.on('data', () => {}); res.on('end', () => resolve());
        });
        req.on('error', (e) => reject(e)); req.write(data); req.end();
    });
}

// 1. ПРЕМИУМ УВЕДОМЛЕНИЯ О ЗАЯВКАХ
app.post('/api/contact', async (req, res) => {
    try {
        const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
        const { name, phone, zipcode, message } = req.body;
        const id = Math.floor(1000 + Math.random() * 9000).toString();
        
        await db.from('leads').insert([{ id, name, phone, zipcode, message, status: 'pending' }]);
        
        const card = `💎 *НОВАЯ ЗАЯВКА [ID: ${id}]*\n` +
                     `━━━━━━━━━━━━━━━━━━\n` +
                     `👤 *Клиент:* ${name}\n` +
                     `📞 *Связь:* [${phone}](tel:${phone})\n` +
                     `📍 *Локация:* ${zipcode}\n` +
                     `━━━━━━━━━━━━━━━━━━\n` +
                     `📝 *Запрос:* _${message || 'Без комментария'}_`;

        await sendMsg(masterChatId, card, {
            inline_keyboard: [
                [{ text: '✅ Выполнено', callback_data: `done_${id}` }, { text: '📒 Детали', callback_data: `info_${id}` }],
                [{ text: '💰 Цена', callback_data: `price_${id}` }, { text: '📍 На карту', callback_data: `map_${id}` }]
            ]
        });
        
        res.status(200).json({ success: true });
    } catch (e) { res.status(500).send(e.message); }
});

// 2. ИНТЕРФЕЙС CRM (БОТ)
app.post('/api/bot', async (req, res) => {
    try {
        const update = req.body;
        if (!update) return res.status(200).send('ok');
        const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

        // ОБРАБОТКА КНОПОК
        if (update.callback_query) {
            const { data, message } = update.callback_query;
            const cid = message.chat.id;
            const lid = data.split('_')[1];

            if (data.startsWith('done_')) {
                await db.from('leads').update({ status: 'completed' }).eq('id', lid);
                await sendMsg(cid, `✨ *Заказ [${lid}] успешно завершен!*`);
            } else if (data.startsWith('info_')) {
                const { data: l } = await db.from('leads').select('*').eq('id', lid).single();
                const detail = `📑 *КАРТОЧКА ЗАКАЗА [${lid}]*\n` +
                               `━━━━━━━━━━━━━━━━━━\n` +
                               `👤 ФИО: ${l.name}\n` +
                               `📞 Тел: ${l.phone}\n` +
                               `💰 Чек: *$${l.price || 0}*\n` +
                               `📅 Дата: ${new Date(l.timestamp).toLocaleDateString()}\n` +
                               `━━━━━━━━━━━━━━━━━━\n` +
                               `📋 Инфо: _${l.info || 'нет заметок'}_`;
                await sendMsg(cid, detail);
            } else if (data.startsWith('map_')) {
                const { data: l } = await db.from('leads').select('zipcode').eq('id', lid).single();
                await sendMsg(cid, `📍 [Проложить маршрут до ${l.zipcode}](https://www.google.com/maps/search/?api=1&query=${l.zipcode}+Texas)`);
            }
            return res.status(200).send('ok');
        }

        // ОБРАБОТКА КОМАНД
        if (update.message && update.message.text) {
            const cid = update.message.chat.id;
            const text = update.message.text;
            const args = text.split(' ');

            if (text === '/start' || text === '/help') {
                const menu = `🏛 *LONE STAR CRM PRO*\n` +
                             `━━━━━━━━━━━━━━━━━━\n` +
                             `📋 /list — Список заявок\n` +
                             `💵 /income — Мои финансы\n` +
                             `📊 /stats — Статистика\n` +
                             `━━━━━━━━━━━━━━━━━━\n` +
                             `🛠 _Нажмите на команду выше_`;
                await sendMsg(cid, menu);
            } else if (text === '/list') {
                const { data } = await db.from('leads').select('*').order('timestamp', { ascending: false }).limit(10);
                let list = `📋 *ПОСЛЕДНИЕ 10 ЗАЯВОК*\n` +
                           `━━━━━━━━━━━━━━━━━━\n`;
                data.forEach(l => {
                    const icon = l.status === 'completed' ? '✅' : '⏳';
                    list += `${icon} *[${l.id}]* ${l.name} — *$${l.price || 0}*\n`;
                });
                await sendMsg(cid, list);
            }
        }
    } catch (err) { console.error(err); }
    res.status(200).send('ok');
});

app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'index.html')); });

module.exports = app;
