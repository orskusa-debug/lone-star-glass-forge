const express = require('express');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const ExcelJS = require('exceljs');

const app = express();
app.use(express.json());

const token = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;

// Универсальная функция отправки сообщений
const tellTelegram = async (cid, text) => {
    try {
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: cid, text: text, parse_mode: 'Markdown' })
        });
    } catch (e) { console.error('TG Send Error:', e); }
};

// 1. КОНТАКТНАЯ ФОРМА
app.post('/api/contact', async (req, res) => {
    try {
        const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
        const { name, phone, zipcode, message } = req.body;
        const id = Math.floor(1000 + Math.random() * 9000).toString();
        
        await db.from('leads').insert([{ id, name, phone, zipcode, message }]);
        await tellTelegram(chatId, `🔥 *НОВАЯ ЗАЯВКА [${id}]*\n👤 *Имя:* ${name}\n📞 *Тел:* ${phone}`);
        
        res.status(200).json({ success: true });
    } catch (err) {
        await tellTelegram(chatId, "❌ Ошибка в форме: " + err.message);
        res.status(500).send(err.message);
    }
});

// 2. БОТ
app.post('/api/bot', async (req, res) => {
    try {
        const update = req.body;
        if (!update || (!update.message && !update.callback_query)) {
            return res.status(200).send('no update');
        }

        const cid = update.message ? update.message.chat.id : update.callback_query.message.chat.id;
        const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

        // Кнопки
        if (update.callback_query) {
            const { data } = update.callback_query;
            const lid = data.split('_')[1];
            if (data.startsWith('complete_')) {
                await db.from('leads').update({ status: 'completed' }).eq('id', lid);
                await tellTelegram(cid, `✅ Сделка [${lid}] закрыта!`);
            }
            return res.status(200).send('ok');
        }

        // Текст
        if (update.message && update.message.text) {
            const text = update.message.text;
            if (text.startsWith('/start') || text.startsWith('/help')) {
                await tellTelegram(cid, "🏛 *Lone Star CRM*\n/list - список\n/stats - стат\n/income - деньги");
            } else if (text === '/list') {
                const { data } = await db.from('leads').select('*').order('timestamp', { ascending: false }).limit(10);
                let r = "📋 *Список:*\n";
                data.forEach(l => { r += `${l.status === 'completed' ? '✅' : '⏳'} [${l.id}] ${l.name}\n`; });
                await tellTelegram(cid, r);
            } else {
                await tellTelegram(cid, "Получено: " + text);
            }
        }
    } catch (err) {
        // КРИТИЧЕСКИЙ ЛОГ В ТЕЛЕГРАМ
        await tellTelegram(chatId, "🛑 *СБОЙ БОТА:* " + err.message);
    }
    res.status(200).send('ok');
});

// 3. САЙТ
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

module.exports = app;
