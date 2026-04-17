const { createClient } = require('@supabase/supabase-js');
const ExcelJS = require('exceljs');

module.exports = async (req, res) => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const { SUPABASE_URL, SUPABASE_KEY } = process.env;
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    if (req.method !== 'POST') return res.status(200).send('CRM Active');

    const update = req.body;
    const sendMessage = async (cid, text, markup = null) => {
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: cid, text, parse_mode: 'Markdown', reply_markup: markup })
        });
    };

    try {
        // 1. Обработка нажатий на кнопки (Callback Query)
        if (update.callback_query) {
            const { data, message } = update.callback_query;
            const cid = message.chat.id;
            const [action, id] = data.split('_');

            if (action === 'complete') {
                await supabase.from('leads').update({ status: 'completed' }).eq('id', id);
                await sendMessage(cid, `✅ Заявка [${id}] завершена!`);
            } else if (action === 'price') {
                await sendMessage(cid, `💰 Чтобы установить цену, напишите:\n\n\`/price ${id} 500\``);
            } else if (action === 'note') {
                await sendMessage(cid, `📒 Чтобы добавить заметку, напишите:\n\n\`/note ${id} Ваш комментарий\``);
            } else if (action === 'info') {
                const { data: lead } = await supabase.from('leads').select('*').eq('id', id).single();
                if (lead) {
                    const info = `📋 *ДЕТАЛИ ЗАЯВКИ [ID: ${id}]*\n\n` +
                                `👤 Имя: ${lead.name}\n` +
                                `📞 Телефон: ${lead.phone}\n` +
                                `📍 Zip: ${lead.zipcode}\n` +
                                `💰 Цена: $${lead.price || 0}\n` +
                                `📒 Заметка: ${lead.info || 'нет'}\n` +
                                `📅 Дата: ${new Date(lead.timestamp).toLocaleString()}`;
                    await sendMessage(cid, info);
                }
            }
            return res.status(200).send('ok');
        }

        // 2. Обработка текстовых команд
        if (!update.message || !update.message.text) return res.status(200).send('ok');
        
        const { text, chat } = update.message;
        const cid = chat.id;
        const args = text.split(' ');
        const cmd = args[0].toLowerCase();

        if (cmd === '/start' || cmd === '/help') {
            await sendMessage(cid, 
                "🚀 *Lone Star CRM ULTIMATE*\n\n" +
                "🔍 *Поиск:*\n" +
                "/search [имя/тел] - найти клиента\n\n" +
                "📊 *Финансы и список:*\n" +
                "/income - ваша прибыль\n" +
                "/list - последние 10\n" +
                "/stats - общая статистика\n\n" +
                "🛠 *Управление:*\n" +
                "/note [id] [текст] - добавить заметку\n" +
                "/price [id] [сумма] - изменить цену\n" +
                "/complete [id] - закрыть сделку\n\n" +
                "📁 *Экспорт:*\n" +
                "/excel - скачать базу"
            );
        }
        else if (cmd === '/income') {
            const { data } = await supabase.from('leads').select('price, status');
            const total = data.filter(l => l.status === 'completed').reduce((sum, l) => sum + (l.price || 0), 0);
            const potential = data.filter(l => l.status === 'pending').reduce((sum, l) => sum + (l.price || 0), 0);
            await sendMessage(cid, `💵 *ФИНАНСОВЫЙ ОТЧЕТ*\n\n✅ Выручка: *$${total}*\n⏳ Ожидается: *$${potential}*`);
        }
        else if (cmd === '/search') {
            const q = args.slice(1).join(' ');
            if (!q) return await sendMessage(cid, "Введите имя или номер телефона для поиска.");
            const { data } = await supabase.from('leads').select('*').or(`name.ilike.%${q}%,phone.ilike.%${q}%`).limit(5);
            if (data && data.length > 0) {
                let res = `🔍 *Результаты поиска:* \n\n`;
                data.forEach(l => { res += `[${l.id}] *${l.name}* (${l.phone})\n`; });
                await sendMessage(cid, res);
            } else {
                await sendMessage(cid, "Ничего не найдено.");
            }
        }
        else if (cmd === '/note') {
            const id = args[1];
            const info = args.slice(2).join(' ');
            if (!id || !info) return await sendMessage(cid, "Формат: `/note 1234 Клиент просит перезвонить` ");
            await supabase.from('leads').update({ info }).eq('id', id);
            await sendMessage(cid, `📒 Заметка к заявке [${id}] сохранена!`);
        }
        else if (cmd === '/list') {
            const { data } = await supabase.from('leads').select('id, name, status, price').order('timestamp', { ascending: false }).limit(10);
            let resp = "📋 *Последние сделки:*\n\n";
            data.forEach(l => { resp += `${l.status === 'completed' ? '✅' : '⏳'} [${l.id}] *${l.name}* - $${l.price || 0}\n`; });
            await sendMessage(cid, resp);
        }
        else if (cmd === '/excel') {
            const { data } = await supabase.from('leads').select('*').order('timestamp', { ascending: false });
            const wb = new ExcelJS.Workbook();
            const ws = wb.addWorksheet('CRM Data');
            ws.columns = [{header:'ID',key:'id'},{header:'Дата',key:'timestamp'},{header:'Имя',key:'name'},{header:'Телефон',key:'phone'},{header:'Сумма',key:'price'},{header:'Заметка',key:'info'}];
            ws.addRows(data);
            const buffer = await wb.xlsx.writeBuffer();
            const formData = new FormData();
            formData.append('chat_id', cid);
            formData.append('document', new Blob([buffer]), 'CRM_Full_Export.xlsx');
            await fetch(`https://api.telegram.org/bot${token}/sendDocument`, { method: 'POST', body: formData });
        }
        else if (cmd === '/price') {
            const id = args[1];
            const sprice = args[2];
            await supabase.from('leads').update({ price: parseFloat(sprice) }).eq('id', id);
            await sendMessage(cid, `💰 Цена для [${id}] обновлена до $${sprice}`);
        }
        else if (cmd === '/complete') {
            const id = args[1];
            await supabase.from('leads').update({ status: 'completed' }).eq('id', id);
            await sendMessage(cid, `✅ Сделка [${id}] закрыта!`);
        }
    } catch (err) {
        console.error(err);
    }
    res.status(200).send('ok');
};
