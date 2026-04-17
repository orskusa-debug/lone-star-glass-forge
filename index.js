const express = require('express');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const ExcelJS = require('exceljs');

const app = express();
app.use(express.json());

// Конфигурация
const token = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// 1. Контактная форма с сайта
app.post('/api/contact', async (req, res) => {
    try {
        const { name, phone, zipcode, message } = req.body;
        const id = Math.floor(1000 + Math.random() * 9000).toString();

        // Пишем в базу
        await supabase.from('leads').insert([{ id, name, phone, zipcode, message }]);

        // Шлем в Telegram с кнопками
        const text = `🔥 *НОВАЯ ЗАЯВКА [ID: ${id}]*\n\n👤 *Имя:* ${name}\n📞 *Тел:* ${phone}\n📍 *Zip:* ${zipcode}\n📝 *Сообщение:* ${message}`;
        
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: text,
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[
                        { text: '✅ Выполнить', callback_data: `complete_${id}` },
                        { text: '📋 Инфо', callback_data: `info_${id}` }
                    ]]
                }
            })
        });
        res.status(200).json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. Бот (Вебхук)
app.post('/api/bot', async (req, res) => {
    const update = req.body;
    
    try {
        // Кнопки
        if (update.callback_query) {
            const { data, message } = update.callback_query;
            const lid = data.split('_')[1];
            if (data.startsWith('complete_')) {
                await supabase.from('leads').update({ status: 'completed' }).eq('id', lid);
                await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ chat_id: message.chat.id, text: `✅ Заявка [${lid}] готова!` })
                });
            }
            return res.status(200).send('ok');
        }

        // Команды
        if (update.message && update.message.text) {
            const cid = update.message.chat.id;
            const text = update.message.text;

            if (text === '/start' || text === '/help') {
                const menu = "🏛 *CRM Lone Star*\n/list - список\n/income - доходы\n/excel - выгрузка";
                await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ chat_id: cid, text: menu, parse_mode: 'Markdown' })
                });
            } else if (text === '/list') {
                const { data } = await supabase.from('leads').select('*').order('timestamp', { ascending: false }).limit(10);
                let r = "📋 *Последние заявки:*\n";
                data.forEach(l => { r += `${l.status === 'completed' ? '✅' : '⏳'} [${l.id}] ${l.name}\n`; });
                await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ chat_id: cid, text: r })
                });
            }
        }
    } catch (err) { console.error(err); }
    res.status(200).send('ok');
});

// 3. Статика (сайт)
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

module.exports = app;
