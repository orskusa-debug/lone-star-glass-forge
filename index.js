const express = require('express');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const ExcelJS = require('exceljs');

const app = express();
app.use(express.json());

const token = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const sendMessage = async (cid, text, markup = null) => {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: cid, text, parse_mode: 'Markdown', reply_markup: markup })
    });
};

// 1. КОНТАКТНАЯ ФОРМА
app.post('/api/contact', async (req, res) => {
    try {
        const { name, phone, zipcode, message } = req.body;
        const id = Math.floor(1000 + Math.random() * 9000).toString();
        await supabase.from('leads').insert([{ id, name, phone, zipcode, message }]);
        
        const txt = `🔥 *НОВАЯ ЗАЯВКА [${id}]*\n👤 *Имя:* ${name}\n📞 *Тел:* ${phone}\n📍 *Zip:* ${zipcode}`;
        await sendMessage(chatId, txt, {
            inline_keyboard: [[
                { text: '✅ Готово', callback_data: `complete_${id}` },
                { text: '📋 Инфо', callback_data: `info_${id}` }
            ]]
        });
        res.status(200).json({ success: true });
    } catch (err) { res.status(500).send(err.message); }
});

// 2. ТЕЛЕГРАМ БОТ
app.post('/api/bot', async (req, res) => {
    const update = req.body;
    try {
        // CALLBACK КНОПКИ
        if (update.callback_query) {
            const { data, message } = update.callback_query;
            const cid = message.chat.id;
            const lid = data.split('_')[1];
            
            if (data.startsWith('complete_')) {
                await supabase.from('leads').update({ status: 'completed' }).eq('id', lid);
                await sendMessage(cid, `✅ Сделка [${lid}] закрыта!`);
            } else if (data.startsWith('info_')) {
                const { data: l } = await supabase.from('leads').select('*').eq('id', lid).single();
                const info = `📋 *ДЕТАЛИ [${lid}]*\n👤 ${l.name}\n📞 ${l.phone}\n💰 $${l.price || 0}\n📒 ${l.info || '-'}`;
                await sendMessage(cid, info, { inline_keyboard: [[{ text: '⬅️ Назад в меню', callback_data: 'menu' }]] });
            } else if (data === 'menu') {
                await sendMessage(cid, "🏛 *Главное меню:* \n/list - список\n/stats - стат");
            }
            return res.status(200).send('ok');
        }

        // ТЕКСТОВЫЕ КОМАНДЫ
        if (update.message && update.message.text) {
            const cid = update.message.chat.id;
            const text = update.message.text;
            const args = text.split(' ');
            const cmd = args[0].toLowerCase();

            if (cmd === '/start' || cmd === '/help' || cmd === '/menu') {
                const help = "🚀 *CRM ULTIMATE*\n\n/list - последние 10\n/search [имя] - поиск\n/income - деньги\n/stats - статистика\n/excel - выгрузка\n\n🛠 /price [id] [сумма]\n🛠 /note [id] [текст]\n🛠 /complete [id]";
                await sendMessage(cid, help);
            } else if (cmd === '/income') {
                const { data } = await supabase.from('leads').select('price, status');
                const done = data.filter(l => l.status === 'completed').reduce((s,l)=>s+(l.price||0), 0);
                const wait = data.filter(l => l.status !== 'completed').reduce((s,l)=>s+(l.price||0), 0);
                await sendMessage(cid, `💵 *ДОХОДЫ*\n✅ Выручка: *$${done}*\n⏳ Ожидание: *$${wait}*`);
            } else if (cmd === '/search') {
                const q = args.slice(1).join(' ');
                const { data } = await supabase.from('leads').select('*').or(`name.ilike.%${q}%,phone.ilike.%${q}%`).limit(5);
                let res = "🔍 *Найдено:* \n\n";
                data.forEach(l => { res += `[${l.id}] *${l.name}*\n`; });
                await sendMessage(cid, res);
            } else if (cmd === '/list') {
                const { data } = await supabase.from('leads').select('*').order('timestamp', { ascending: false }).limit(10);
                let r = "📋 *Список:*\n";
                data.forEach(l => { r += `${l.status === 'completed' ? '✅' : '⏳'} [${l.id}] ${l.name} - $${l.price || 0}\n`; });
                await sendMessage(cid, r);
            } else if (cmd === '/price') {
                await supabase.from('leads').update({ price: parseFloat(args[2]) }).eq('id', args[1]);
                await sendMessage(cid, `💰 Цена для [${args[1]}] = $${args[2]}`);
            } else if (cmd === '/note') {
                await supabase.from('leads').update({ info: args.slice(2).join(' ') }).eq('id', args[1]);
                await sendMessage(cid, `📒 Заметка для [${args[1]}] сохранена.`);
            } else if (cmd === '/complete') {
                await supabase.from('leads').update({ status: 'completed' }).eq('id', args[1]);
                await sendMessage(cid, `✅ Сделка [${args[1]}] закрыта!`);
            } else if (cmd === '/excel') {
                const { data } = await supabase.from('leads').select('*');
                const wb = new ExcelJS.Workbook();
                const ws = wb.addWorksheet('CRM');
                ws.columns = [{header:'ID',key:'id'},{header:'Name',key:'name'},{header:'Price',key:'price'}];
                ws.addRows(data);
                const buf = await wb.xlsx.writeBuffer();
                const fd = new FormData();
                fd.append('chat_id', cid);
                fd.append('document', new Blob([buf]), 'CRM_Export.xlsx');
                await fetch(`https://api.telegram.org/bot${token}/sendDocument`, { method: 'POST', body: fd });
            }
        }
    } catch (err) { console.error(err); }
    res.status(200).send('ok');
});

// 3. САЙТ
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

module.exports = app;
