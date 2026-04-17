const { createClient } = require('@supabase/supabase-js');
const ExcelJS = require('exceljs');

module.exports = async (req, res) => {
    // Конфигурация
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_KEY;

    // Функция отправки (через fetch чтобы не зависеть от библиотек)
    const sendText = async (chatId, text, markup = null) => {
        try {
            await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown', reply_markup: markup })
            });
        } catch (e) { console.error('Fetch Error:', e); }
    };

    if (req.method !== 'POST') return res.status(200).send('CRM Alive');

    const update = req.body;
    if (!update) return res.status(200).send('no body');

    // Начинаем общую обработку
    try {
        // --- ОБРАБОТКА КНОПОК ---
        if (update.callback_query) {
            const { data, message } = update.callback_query;
            const cid = message.chat.id;
            const [action, id] = data.split('_');
            const supabase = createClient(url, key);

            if (action === 'info') {
                const { data: l } = await supabase.from('leads').select('*').eq('id', id).single();
                if (l) {
                    const info = `💎 *ЗАЯВКА [${id}]*\n👤 *Имя:* ${l.name}\n📞 *Тел:* ${l.phone}\n📍 *Zip:* ${l.zipcode}\n📒 *Заметка:* ${l.info || 'нет'}`;
                    await sendText(cid, info);
                }
            } else if (action === 'complete') {
                await supabase.from('leads').update({ status: 'completed' }).eq('id', id);
                await sendText(cid, `✅ Сделка [${id}] закрыта!`);
            }
            return res.status(200).send('ok');
        }

        // --- ОБРАБОТКА КОМАНД ---
        if (update.message && update.message.text) {
            const cid = update.message.chat.id;
            const text = update.message.text;
            const args = text.split(' ');
            const cmd = args[0].toLowerCase();

            if (cmd === '/start' || cmd === '/help') {
                await sendText(cid, "🏛 *LONE STAR CRM v2.1*\n\n/list - список\n/income - деньги\n/stats - статистика\n/excel - выгрузка");
            } else if (cmd === '/income') {
                const supabase = createClient(url, key);
                const { data } = await supabase.from('leads').select('price, status');
                const done = data.filter(l => l.status === 'completed').reduce((s,l)=>s+(l.price||0), 0);
                await sendText(cid, `💰 *Выручка:* $${done}\n📈 Всего заявок: ${data.length}`);
            } else if (cmd === '/list') {
                const supabase = createClient(url, key);
                const { data } = await supabase.from('leads').select('id, name, status').order('timestamp', { ascending: false }).limit(10);
                let r = "📋 *Список:*\n";
                data.forEach(l => { r += `${l.status === 'completed' ? '✅' : '⏳'} [${l.id}] ${l.name}\n`; });
                await sendText(cid, r);
            }
        }
    } catch (err) {
        // ЕСЛИ ПРОИЗОШЛА ЛЮБАЯ ОШИБКА - МЫ УЗНАЕМ О НЕЙ В ТЕЛЕГРАМ!
        if (update.message) {
            await sendText(update.message.chat.id, "❌ *Ошибка CRM:* " + err.message);
        }
    }

    res.status(200).send('ok');
};
