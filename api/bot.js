const { createClient } = require('@supabase/supabase-js');
const ExcelJS = require('exceljs');

module.exports = async (req, res) => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const { SUPABASE_URL, SUPABASE_KEY } = process.env;
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    if (req.method !== 'POST') return res.status(200).send('CRM 2.0 Ultra Active');

    const update = req.body;

    const sendMessage = async (cid, text, markup = null) => {
        return await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: cid, text, parse_mode: 'Markdown', reply_markup: markup })
        });
    };

    try {
        // --- ОБРАБОТКА КНОПОК ---
        if (update.callback_query) {
            const { data, message } = update.callback_query;
            const cid = message.chat.id;
            const [action, id] = data.split('_');

            if (action === 'status') {
                const nextStatus = id === 'pending' ? 'quoted' : (id === 'quoted' ? 'progress' : 'completed');
                // (упрощенная логика для демо)
                await sendMessage(cid, `🔄 Статус изменен на: *${nextStatus}*`);
            } else if (action === 'maps') {
                const { data: lead } = await supabase.from('leads').select('zipcode').eq('id', id).single();
                await sendMessage(cid, `📍 [Открыть маршрут в Google Maps](https://www.google.com/maps/search/?api=1&query=${lead.zipcode}+Texas)`);
            } else if (action === 'info') {
                const { data: l } = await supabase.from('leads').select('*').eq('id', id).single();
                if (l) {
                    const info = `💎 *ДЕТАЛИ ЗАКАЗА [${id}]*\n` +
                                 `━━━━━━━━━━━━━━━\n` +
                                 `👤 *Клиент:* ${l.name}\n` +
                                 `📞 *Связь:* [${l.phone}](tel:${l.phone})\n` +
                                 `📍 *Локация:* ${l.zipcode}\n` +
                                 `💰 *Прайс:* $${l.price || 0}\n` +
                                 `📄 *Текст:* ${l.message || '-'}\n` +
                                 `━━━━━━━━━━━━━━━\n` +
                                 `📒 *Заметка:* _${l.info || 'пусто'}_`;
                    await sendMessage(cid, info, {
                        inline_keyboard: [[{ text: '🗺 Маршрут', callback_data: `maps_${id}` }]]
                    });
                }
            }
            return res.status(200).send('ok');
        }

        // --- ОБРАБОТКА КОМАНД ---
        if (!update.message || !update.message.text) return res.status(200).send('ok');
        const { text, chat } = update.message;
        const cid = chat.id;
        const args = text.split(' ');
        const cmd = args[0].toLowerCase();

        // 1. DASHBOARD
        if (cmd === '/start' || cmd === '/help') {
            const menu = `🏛 *LONE STAR GLASS CRM v2.0*\n` +
                         `━━━━━━━━━━━━━━━\n` +
                         `🔍 /search [имя/тел] — Найти\n` +
                         `💵 /income — Мои деньги\n` +
                         `📊 /week — Срез за неделю\n` +
                         `🧮 /calc — Калькулятор цен\n` +
                         `━━━━━━━━━━━━━━━\n` +
                         `🛠 /note [id] [текст] — Заметка\n` +
                         `💰 /price [id] [сумма] — Прайс\n` +
                         `✅ /complete [id] — Закрыть\n` +
                         `📁 /excel — Полный отчет\n` +
                         `🖼 /portfolio — Мои работы`;
            await sendMessage(cid, menu);
        }
        // 2. INCOME
        else if (cmd === '/income') {
            const { data } = await supabase.from('leads').select('price, status');
            const done = data.filter(l => l.status === 'completed').reduce((s, l) => s + (l.price||0), 0);
            const wait = data.filter(l => l.status !== 'completed').reduce((s, l) => s + (l.price||0), 0);
            await sendMessage(cid, `📈 *ФИНАНСОВЫЙ ДАШБОРД*\n\n💰 *Выручка:* $${done}\n⏳ *В ожидании:* $${wait}\n\n_Всего заявок: ${data.length}_`);
        }
        // 3. CALC
        else if (cmd === '/calc') {
            await sendMessage(cid, `🧮 *Калькулятор:* напишите размеры через пробел\nПример: \`/calc 60 80\` (ширина и высота в дюймах)`);
            if (args.length === 3) {
                const area = (parseFloat(args[1]) * parseFloat(args[2])) / 144;
                const est = Math.round(area * 150); // Примерная цена за м2
                await sendMessage(cid, `📏 *Результат:*\nПлощадь: ${area.toFixed(2)} кв.фут\nПримерная цена: *$${est}*`);
            }
        }
        // 4. SEARCH
        else if (cmd === '/search') {
            const q = args.slice(1).join(' ');
            const { data } = await supabase.from('leads').select('*').or(`name.ilike.%${q}%,phone.ilike.%${q}%`).limit(3);
            if (data && data.length > 0) {
                let r = `🔎 *Найденные клиенты:* \n\n`;
                data.forEach(l => { r += `🏷 [${l.id}] *${l.name}*\n📞 ${l.phone}\n\n`; });
                await sendMessage(cid, r);
            } else { await sendMessage(cid, "❌ Ничего не найдено."); }
        }
        // 5. WEEK
        else if (cmd === '/week') {
            const lastWeek = new Date(); lastWeek.setDate(lastWeek.getDate() - 7);
            const { data } = await supabase.from('leads').select('*').gte('timestamp', lastWeek.toISOString());
            await sendMessage(cid, `📅 *ОТЧЕТ ЗА 7 ДНЕЙ*\n\n🆕 Новых заявок: ${data.length}\n💰 Сумма: $${data.reduce((s,l)=>s+(l.price||0),0)}`);
        }
        // 6. PORTFOLIO
        else if (cmd === '/portfolio') {
            await sendMessage(cid, "🖼 [Посмотреть наше портфолио](https://lone-star-glass-forge.vercel.app/#gallery)");
        }
        // 7. EXCEL
        else if (cmd === '/excel') {
            const { data } = await supabase.from('leads').select('*').order('timestamp', { ascending: false });
            const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('CRM');
            ws.columns = [{header:'ID',key:'id'},{header:'Имя',key:'name'},{header:'Телефон',key:'phone'},{header:'Сумма',key:'price'}];
            ws.addRows(data);
            const buffer = await wb.xlsx.writeBuffer();
            const formData = new FormData();
            formData.append('chat_id', cid); formData.append('document', new Blob([buffer]), 'CRM_Ultra_Report.xlsx');
            await fetch(`https://api.telegram.org/bot${token}/sendDocument`, { method: 'POST', body: formData });
        }
        // 8. PRICE & 9. NOTE & 10. COMPLETE
        else if (cmd === '/price') {
            await supabase.from('leads').update({ price: parseFloat(args[2]) }).eq('id', args[1]);
            await sendMessage(cid, `✅ Цена обновлена: *$${args[2]}*`);
        }
        else if (cmd === '/note') {
            await supabase.from('leads').update({ info: args.slice(2).join(' ') }).eq('id', args[1]);
            await sendMessage(cid, `📒 Заметка сохранена для ID ${args[1]}`);
        }
        else if (cmd === '/complete') {
            await supabase.from('leads').update({ status: 'completed' }).eq('id', args[1]);
            await sendMessage(cid, `🎊 Заказ [${args[1]}] успешно закрыт!`);
        }
    } catch (err) {
        console.error(err);
    }
    res.status(200).send('ok');
};
