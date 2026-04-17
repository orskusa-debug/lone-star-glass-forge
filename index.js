const express = require('express');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json());

const token = process.env.TELEGRAM_BOT_TOKEN;
const masterChatId = process.env.TELEGRAM_CHAT_ID;

// САМАЯ СТАБИЛЬНАЯ ОТПРАВКА ЧЕРЕЗ ГЛОБАЛЬНЫЙ FETCH
async function sendMsg(cid, text, markup = null) {
    try {
        const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: cid,
                text: text,
                parse_mode: 'Markdown',
                reply_markup: markup
            })
        });
        if (!response.ok) {
            console.error('Telegram API Error:', await response.text());
        }
    } catch (e) {
        console.error('Fetch Fatal Error:', e);
    }
}

// 1. КОНТАКТНАЯ ФОРМА
app.post('/api/contact', async (req, res) => {
    try {
        const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
        const { name, phone, zipcode, message } = req.body;
        const id = Math.floor(1000 + Math.random() * 9000).toString();
        
        await db.from('leads').insert([{ id, name, phone, zipcode, message, status: 'pending' }]);
        
        const card = `💎 *НОВАЯ ЗАЯВКА [ID: ${id}]*\n` +
                     `━━━━━━━━━━━━━━━━━━\n` +
                     `👤 *Клиент:* ${name}\n` +
                     `📞 *Связь:* ${phone}\n` +
                     `📍 *Zip:* ${zipcode}\n` +
                     `━━━━━━━━━━━━━━━━━━\n` +
                     `📝 *Запрос:* _${message || 'Без комментария'}_`;

        await sendMsg(masterChatId, card, {
            inline_keyboard: [
                [{ text: '✅ Выполнено', callback_data: `done_${id}` }, { text: '📒 Детали', callback_data: `info_${id}` }]
            ]
        });
        
        res.status(200).json({ success: true });
    } catch (e) { res.status(500).send(e.message); }
});

// 2. БОТ
app.post('/api/bot', async (req, res) => {
    try {
        const update = req.body;
        if (!update) return res.status(200).send('ok');
        const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

        if (update.callback_query) {
            const { data, message } = update.callback_query;
            const cid = message.chat.id;
            const lid = data.split('_')[1];
            if (data.startsWith('done_')) {
                await db.from('leads').update({ status: 'completed' }).eq('id', lid);
                await sendMsg(cid, `✅ *Заказ [${lid}] завершен!*`);
            }
            return res.status(200).send('ok');
        }

        if (update.message && update.message.text) {
            const cid = update.message.chat.id;
            const text = update.message.text;
            if (text === '/start' || text === '/list') {
                const { data } = await db.from('leads').select('*').order('timestamp', { ascending: false }).limit(10);
                let r = "📋 *СПИСОК ЗАЯВОК*\n━━━━━━━━━━━━━━━━━━\n";
                if (!data || data.length === 0) r += "_Пока пусто_";
                else data.forEach(l => { r += `${l.status==='completed'?'✅':'⏳'} *[${l.id}]* ${l.name}\n`; });
                await sendMsg(cid, r);
            }
        }
    } catch (err) { console.error(err); }
    res.status(200).send('ok');
});

app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'index.html')); });

module.exports = app;
