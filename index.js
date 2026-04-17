const express = require('express');
const path = require('path');
const https = require('https');
const { createClient } = require('@supabase/supabase-js');
const ExcelJS = require('exceljs');

const app = express();
app.use(express.json());

const token = process.env.TELEGRAM_BOT_TOKEN;
const masterChatId = process.env.TELEGRAM_CHAT_ID;

// СТАБИЛЬНЫЙ ПЕРЕДАТЧИК
function sendMsg(cid, text, markup = null) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify({ chat_id: cid, text, parse_mode: 'Markdown', reply_markup: markup });
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

// 1. КОНТАКТНАЯ ФОРМА
app.post('/api/contact', async (req, res) => {
    try {
        const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
        const { name, phone, zipcode, message } = req.body;
        const id = Math.floor(1000 + Math.random() * 9000).toString();
        await db.from('leads').insert([{ id, name, phone, zipcode, message, status: 'pending' }]);
        
        await sendMsg(masterChatId, `🔥 *ЗАЯВКА [${id}]*\n👤 ${name}\n📞 ${phone}`, {
            inline_keyboard: [
                [{ text: '✅ Готово', callback_data: `done_${id}` }, { text: '📋 Инфо', callback_data: `info_${id}` }],
                [{ text: '💰 Цена', callback_data: `uiprice_${id}` }, { text: '📒 Заметка', callback_data: `uinote_${id}` }]
            ]
        });
        res.status(200).json({ success: true });
    } catch (e) { res.status(500).send(e.message); }
});

// 2. БОТ CRM
app.post('/api/bot', async (req, res) => {
    try {
        const update = req.body;
        if (!update) return res.status(200).send('ok');
        const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

        // КНОПКИ
        if (update.callback_query) {
            const { data, message } = update.callback_query;
            const cid = message.chat.id;
            const lid = data.split('_')[1];
            if (data.startsWith('done_')) {
                await db.from('leads').update({ status: 'completed' }).eq('id', lid);
                await sendMsg(cid, `✅ Сделка [${lid}] зафиналена!`);
            } else if (data.startsWith('info_')) {
                const { data: l } = await db.from('leads').select('*').eq('id', lid).single();
                await sendMsg(cid, `📑 *ID: ${lid}*\n👤 ${l.name}\n📞 ${l.phone}\n💰 $${l.price || 0}\n📝 ${l.message || '-'}`);
            } else if (data.startsWith('uiprice_')) {
                await sendMsg(cid, `💰 Чтобы установить цену, напишите:\n\`/price ${lid} 500\``);
            } else if (data.startsWith('uinote_')) {
                await sendMsg(cid, `📒 Чтобы добавить заметку, напишите:\n\`/note ${lid} Ваш текст\``);
            }
            return res.status(200).send('ok');
        }

        // КОМАНДЫ
        if (update.message && update.message.text) {
            const cid = update.message.chat.id;
            const text = update.message.text;
            const args = text.split(' ');
            const cmd = args[0].toLowerCase();

            if (cmd === '/start' || cmd === '/help') {
                await sendMsg(cid, "🏛 *Lone Star CRM*\n\n/list - список\n/income - финансы\n/stats - статистика\n\n/price [id] [сумма]\n/note [id] [заметка]");
            } else if (cmd === '/list') {
                const { data } = await db.from('leads').select('*').order('timestamp', { ascending: false }).limit(10);
                let r = "📋 *ПОСЛЕДНИЕ ЗАЯВКИ:*\n\n";
                if (data) data.forEach(l => { r += `${l.status==='completed'?'✅':'⏳'} [${l.id}] ${l.name} - $${l.price || 0}\n`; });
                await sendMsg(cid, r);
            } else if (cmd === '/income') {
                const { data } = await db.from('leads').select('price, status');
                const total = data.filter(l => l.status === 'completed').reduce((s,l)=>s+(l.price||0), 0);
                const wait = data.filter(l => l.status !== 'completed').reduce((s,l)=>s+(l.price||0), 0);
                await sendMsg(cid, `💵 *ДОХОДЫ*\n✅ Выручка: *$${total}*\n⏳ Ожидание: *$${wait}*`);
            } else if (cmd === '/stats') {
                const { data } = await db.from('leads').select('status');
                const stats = data.reduce((acc, l) => { acc[l.status] = (acc[l.status] || 0) + 1; return acc; }, {});
                await sendMsg(cid, `📊 *СТАТИСТИКА*\n⏳ В работе: ${stats.pending || 0}\n✅ Завершено: ${stats.completed || 0}\n📈 Всего: ${data.length}`);
            } else if (cmd === '/price') {
                await db.from('leads').update({ price: parseFloat(args[2]) }).eq('id', args[1]);
                await sendMsg(cid, `💰 Цена для [${args[1]}] обновлена: $${args[2]}`);
            } else if (cmd === '/note') {
                await db.from('leads').update({ info: args.slice(2).join(' ') }).eq('id', args[1]);
                await sendMsg(cid, `📒 Заметка для [${args[1]}] сохранена.`);
            } else {
                await sendMsg(cid, `🔔 Сообщение получено. Для команд используйте /help`);
            }
        }
    } catch (err) { console.error('Bot Error:', err); }
    res.status(200).send('ok');
});

// 3. САЙТ
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'index.html')); });

module.exports = app;
