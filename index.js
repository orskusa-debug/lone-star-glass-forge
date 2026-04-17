const express = require('express');
const path = require('path');
const https = require('https');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json());

const token = process.env.TELEGRAM_BOT_TOKEN;
const masterChatId = process.env.TELEGRAM_CHAT_ID;

// САМАЯ НАДЕЖНАЯ ФУНКЦИЯ ОТПРАВКИ (БЕЗ FETCH)
function sendMsg(cid, text, markup = null) {
    const data = JSON.stringify({
        chat_id: cid,
        text: text,
        parse_mode: 'Markdown',
        reply_markup: markup
    });

    const options = {
        hostname: 'api.telegram.org',
        port: 443,
        path: `/bot${token}/sendMessage`,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': data.length
        }
    };

    const req = https.request(options);
    req.write(data);
    req.end();
}

// 1. САЙТ -> ТЕЛЕГРАМ
app.post('/api/contact', async (req, res) => {
    try {
        const { name, phone, zipcode, message } = req.body;
        const id = Math.floor(1000 + Math.random() * 9000).toString();
        const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
        
        await db.from('leads').insert([{ id, name, phone, zipcode, message }]);
        
        const txt = `🔥 *ЗАЯВКА [${id}]*\n👤 ${name}\n📞 ${phone}\n📍 ${zipcode}`;
        sendMsg(masterChatId, txt, {
            inline_keyboard: [[
                { text: '✅ Готово', callback_data: `done_${id}` },
                { text: '📋 Инфо', callback_data: `info_${id}` }
            ]]
        });
        res.status(200).json({ success: true });
    } catch (e) { res.status(500).send(e.message); }
});

// 2. БОТ (УПРАВЛЕНИЕ)
app.post('/api/bot', async (req, res) => {
    try {
        const update = req.body;
        if (!update) return res.status(200).send('no update');
        const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

        // КНОПКИ
        if (update.callback_query) {
            const { data, message } = update.callback_query;
            const cid = message.chat.id;
            const lid = data.split('_')[1];

            if (data.startsWith('done_')) {
                await db.from('leads').update({ status: 'completed' }).eq('id', lid);
                sendMsg(cid, `✅ Сделка [${lid}] закрыта!`);
            } else if (data.startsWith('info_')) {
                const { data: l } = await db.from('leads').select('*').eq('id', lid).single();
                const info = `📋 *ID: ${lid}*\n👤 ${l.name}\n📞 ${l.phone}\n💰 $${l.price || 0}\n📒 ${l.info || '-'}`;
                sendMsg(cid, info);
            }
            return res.status(200).send('ok');
        }

        // КОМАНДЫ
        if (update.message && update.message.text) {
            const cid = update.message.chat.id;
            const text = update.message.text;
            const args = text.split(' ');

            if (text === '/start' || text === '/help') {
                sendMsg(cid, "🏛 *Lone Star CRM*\n/list - список\n/income - доходы");
            } else if (text === '/list') {
                const { data } = await db.from('leads').select('*').order('timestamp', { ascending: false }).limit(10);
                let r = "📋 *Список:*\n";
                data.forEach(l => { r += `${l.status==='completed'?'✅':'⏳'} [${l.id}] ${l.name}\n`; });
                sendMsg(cid, r);
            } else if (args[0] === '/price') {
                await db.from('leads').update({ price: parseFloat(args[2]) }).eq('id', args[1]);
                sendMsg(cid, `💰 Цена [${args[1]}] = $${args[2]}`);
            }
        }
    } catch (err) { console.error('Bot Critical Error:', err); }
    res.status(200).send('ok');
});

// 3. САЙТ (СТАТИКА)
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

module.exports = app;
