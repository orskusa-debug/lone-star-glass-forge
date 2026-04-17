export default async function handler(req, res) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_KEY;

    if (req.method !== 'POST') {
        return res.status(200).send('Bot Status: Active');
    }

    const update = req.body;
    
    // Если это не текстовое сообщение, игнорируем
    if (!update || !update.message || !update.message.text) {
        return res.status(200).send('ok');
    }

    const { text, chat } = update.message;
    const chatId = chat.id;

    // Функция для ответа в Telegram
    const sendMessage = async (messageText) => {
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: messageText,
                parse_mode: 'Markdown'
            })
        });
    };

    try {
        if (text === '/start' || text === '/help') {
            await sendMessage("🛠 *Lone Star CRM (Direct Mode)*\n\nБот на связи! Команды:\n• /list — последние заявки\n• /help — эта справка");
        } 
        else if (text === '/list') {
            if (supabaseUrl && supabaseKey) {
                // Динамический импорт клиента базы данных
                const { createClient } = require('@supabase/supabase-js');
                const supabase = createClient(supabaseUrl, supabaseKey);
                
                const { data, error } = await supabase
                    .from('leads')
                    .select('id, name, status')
                    .order('timestamp', { ascending: false })
                    .limit(10);

                if (error) throw error;

                if (data && data.length > 0) {
                    let resp = "📋 *Последние заявки:*\n\n";
                    data.forEach(l => {
                        resp += `${l.status === 'pending' ? '⏳' : '✅'} [${l.id}] *${l.name}*\n`;
                    });
                    await sendMessage(resp);
                } else {
                    await sendMessage("📭 Заявок пока нет.");
                }
            } else {
                await sendMessage("⚙️ База данных не настроена.");
            }
        } 
        else {
            await sendMessage("Вы написали: " + text);
        }
    } catch (error) {
        console.error('Webhook Error:', error);
        await sendMessage("❌ Ошибка: " + (error.message || "Технические неполадки"));
    }

    return res.status(200).send('ok');
}
