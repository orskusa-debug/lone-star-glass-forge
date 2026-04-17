const { createClient } = require('@supabase/supabase-js');
const ExcelJS = require('exceljs');

export default async function handler(req, res) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_KEY;

    if (req.method !== 'POST') {
        return res.status(200).send('Lone Star Bot is active');
    }

    const update = req.body;
    if (!update || !update.message || !update.message.text) {
        return res.status(200).send('ok');
    }

    const { text, chat } = update.message;
    const chatId = chat.id;

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Функция отправки текста
    const sendMessage = async (messageText) => {
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: messageText, parse_mode: 'Markdown' })
        });
    };

    try {
        if (text === '/start' || text === '/help') {
            const helpText = 
                "🛠 *Lone Star CRM Dashboard*\n\n" +
                "📋 *Управление заказами:*\n" +
                "/list - последние 10 заявок\n" +
                "/list_all - все активные заявки\n" +
                "/stats - общая статистика\n\n" +
                "📊 *Отчетность:*\n" +
                "/excel - выгрузить базу в Excel\n\n" +
                "ℹ️ *Подсказка:*\n" +
                "Вы можете просто нажать на команду в списке выше.";
            await sendMessage(helpText);
        } 
        else if (text === '/list' || text === '/list_all') {
            const limit = text === '/list' ? 10 : 100;
            const { data, error } = await supabase
                .from('leads')
                .select('id, name, status, timestamp')
                .order('timestamp', { ascending: false })
                .limit(limit);

            if (error) throw error;
            if (data && data.length > 0) {
                let resp = text === '/list' ? "📋 *Последние 10 заявок:*\n\n" : "📋 *Список всех заявок:*\n\n";
                data.forEach(l => {
                    const date = new Date(l.timestamp).toLocaleDateString();
                    resp += `${l.status === 'pending' ? '⏳' : '✅'} [${l.id}] *${l.name}* (${date})\n`;
                });
                await sendMessage(resp);
            } else {
                await sendMessage("📭 В базе данных пока нет заявок.");
            }
        } 
        else if (text === '/stats') {
            const { data, error } = await supabase.from('leads').select('status');
            if (error) throw error;
            
            const stats = data.reduce((acc, curr) => {
                acc[curr.status] = (acc[curr.status] || 0) + 1;
                return acc;
            }, {});

            const statsText = 
                "📊 *Статистика базы:*\n\n" +
                `⏳ В ожидании: ${stats.pending || 0}\n` +
                `✅ Завершено: ${stats.completed || 0}\n` +
                `❌ Отменено: ${stats.cancelled || 0}\n\n` +
                `📈 Всего заявок: ${data.length}`;
            await sendMessage(statsText);
        }
        else if (text === '/excel') {
            const { data, error } = await supabase.from('leads').select('*').order('timestamp', { ascending: false });
            if (error) throw error;

            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('Leads');
            worksheet.columns = [
                { header: 'ID', key: 'id' },
                { header: 'Date', key: 'timestamp' },
                { header: 'Name', key: 'name' },
                { header: 'Phone', key: 'phone' },
                { header: 'Zip', key: 'zipcode' },
                { header: 'Message', key: 'message' },
                { header: 'Status', key: 'status' }
            ];
            worksheet.addRows(data);
            const buffer = await workbook.xlsx.writeBuffer();

            // Отправка файла через multipart/form-data
            const formData = new FormData();
            formData.append('chat_id', chatId);
            formData.append('document', new Blob([buffer]), 'Leads_Report.xlsx');

            await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
                method: 'POST',
                body: formData
            });
        }
        else {
            await sendMessage("Я получил: " + text + ". Используйте /help для списка команд.");
        }
    } catch (error) {
        console.error('Bot Error:', error);
        await sendMessage("❌ Ошибка выполнения команды: " + error.message);
    }

    return res.status(200).send('ok');
}
