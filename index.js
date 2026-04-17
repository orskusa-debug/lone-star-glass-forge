const express = require('express');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const ExcelJS = require('exceljs');

const app = express();
app.use(express.json());

const token = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;

const tellTelegram = async (cid, text, markup = null) => {
    try {
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: cid, text: text, parse_mode: 'Markdown', reply_markup: markup })
        });
    } catch (e) { console.error('TG Error:', e); }
};

// 1. КОНТАКТНАЯ ФОРМА
app.post('/api/contact', async (req, res) => {
    try {
        const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
        const { name, phone, zipcode, message } = req.body;
        const id = Math.floor(1000 + Math.random() * 9000).toString();
        await db.from('leads').insert([{ id, name, phone, zipcode, message }]);
        
        await tellTelegram(chatId, `🔥 *НОВЫЙ ЗАКАЗ [${id}]*\n👤 *Имя:* ${name}\n📞 *Тел:* ${phone}`, {
            inline_keyboard: [
                [{ text: '✅ Выполнить', callback_data: `complete_${id}` }, { text: '📋 Инфо', callback_data: `info_${id}` }],
                [{ text: '💰 Цена', callback_data: `ui_price_${id}` }, { text: '📒 Заметка', callback_data: `ui_note_${id}` }]
            ]
        });
        res.status(200).json({ success: true });
    } catch (err) { res.status(500).send(err.message); }
});

// 2. БОТ (CRM)
app.post('/api/bot', async (req, res) => {
    try {
        const update = req.body;
        if (!update) return res.status(200).send('no body');
        const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

        // КНОПКИ
        if (update.callback_query) {
            const { data, message } = update.callback_query;
            const cid = message.chat.id;
            const lid = data.split('_')[2] || data.split('_')[1];

            if (data.startsWith('complete_')) {
                await db.from('leads').update({ status: 'completed' }).eq('id', lid);
                await tellTelegram(cid, `✅ Сделка [${lid}] успешно завершена!`);
            } else if (data.startsWith('info_')) {
                const { data: l } = await db.from('leads').select('*').eq('id', lid).single();
                const info = `📋 *ДЕТАЛИ ЗАКАЗА [${lid}]*\n👤 *Клиент:* ${l.name}\n📞 *Тел:* ${l.phone}\n📍 *Zip:* ${l.zipcode}\n💰 *Сумма:* $${l.price || 0}\n📝 ${l.message || '-'}\n📒 Заметка: ${l.info || 'нет'}`;
                await tellTelegram(cid, info);
            } else if (data.startsWith('ui_price_')) {
                await tellTelegram(cid, `💰 Чтобы установить цену, напишите:\n\n\`/price ${lid} 500\``);
            } else if (data.startsWith('ui_note_')) {
                await tellTelegram(cid, `📒 Чтобы добавить заметку, напишите:\n\n\`/note ${lid} Текст заметки\``);
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
                const help = "🏛 *Lone Star CRM ULTIMATE*\n\n/list - последние 10\n/income - финансы\n/stats - статистика\n/excel - выгрузка базы\n\n/search [имя] - поиск\n/price [id] [сумма] - цена\n/note [id] [текст] - заметка";
                await tellTelegram(cid, help);
            } else if (cmd === '/income') {
                const { data } = await db.from('leads').select('price, status');
                const total = data.filter(l => l.status === 'completed').reduce((s,l)=>s+(l.price||0), 0);
                const wait = data.filter(l => l.status !== 'completed').reduce((s,l)=>s+(l.price||0), 0);
                await tellTelegram(cid, `💵 *ДОХОДЫ*\n✅ Выручка: *$${total}*\n⏳ Ожидание: *$${wait}*`);
            } else if (cmd === '/stats') {
                const { data } = await db.from('leads').select('status');
                const stats = data.reduce((acc, l) => { acc[l.status] = (acc[l.status] || 0) + 1; return acc; }, {});
                await tellTelegram(cid, `📊 *СТАТИСТИКА*\n⏳ В работе: ${stats.pending || 0}\n✅ Завершено: ${stats.completed || 0}\n📈 Всего: ${data.length}`);
            } else if (cmd === '/list') {
                const { data } = await db.from('leads').select('*').order('timestamp', { ascending: false }).limit(10);
                let r = "📋 *ПОСЛЕДНИЕ ЗАЯВКИ:*\n\n";
                data.forEach(l => { r += `${l.status === 'completed' ? '✅' : '⏳'} [${l.id}] *${l.name}* - $${l.price || 0}\n`; });
                await tellTelegram(cid, r);
            } else if (cmd === '/price') {
                await db.from('leads').update({ price: parseFloat(args[2]) }).eq('id', args[1]);
                await tellTelegram(cid, `💰 Цена для [${args[1]}] установлена: $${args[2]}`);
            } else if (cmd === '/note') {
                await db.from('leads').update({ info: args.slice(2).join(' ') }).eq('id', args[1]);
                await tellTelegram(cid, `📒 Заметка для [${args[1]}] сохранена.`);
            } else if (cmd === '/excel') {
                const { data } = await db.from('leads').select('*');
                const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Leads');
                ws.columns = [{header:'ID',key:'id'},{header:'Name',key:'name'},{header:'Phone',key:'phone'},{header:'Price',key:'price'}];
                ws.addRows(data);
                const buf = await wb.xlsx.writeBuffer();
                const fd = new FormData(); fd.append('chat_id', cid); fd.append('document', new Blob([buf]), 'CRM_Export.xlsx');
                await fetch(`https://api.telegram.org/bot${token}/sendDocument`, { method: 'POST', body: fd });
            } else if (cmd === '/search') {
                const q = args.slice(1).join(' ');
                const { data } = await db.from('leads').select('*').or(`name.ilike.%${q}%,phone.ilike.%${q}%`).limit(5);
                let sr = "🔍 *РЕЗУЛЬТАТЫ ПОИСКА:* \n\n";
                data.forEach(l => { sr += `🏷 [${l.id}] *${l.name}* (${l.phone})\n`; });
                await tellTelegram(cid, sr || "Ничего не найдено.");
            }
        }
    } catch (err) { await tellTelegram(chatId, "🛑 *Сбой:* " + err.message); }
    res.status(200).send('ok');
});

app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'index.html')); });

module.exports = app;
