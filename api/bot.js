const TelegramBot = require('node-telegram-bot-api');
const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_KEY;

    // Инициализируем бота сразу
    const bot = new TelegramBot(token);

    if (req.method !== 'POST') {
        return res.status(200).send('Бот на связи. Метод: ' + req.method);
    }

    const update = req.body;
    console.log('Update payload:', JSON.stringify(update));

    if (update && update.message) {
        const msg = update.message;
        const text = msg.text || "";

        try {
            if (text === '/start' || text === '/help') {
                await bot.sendMessage(msg.chat.id, 
                    "🛠 *Lone Star CRM (Supabase)*\n\n" +
                    "Я готов! Доступные команды:\n" +
                    "• /list — последние 10 заявок\n" +
                    "• /help — эта справка", 
                    { parse_mode: 'Markdown' }
                );
            } else if (text === '/list') {
                if (supabaseUrl && supabaseKey) {
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
                        await bot.sendMessage(msg.chat.id, resp, { parse_mode: 'Markdown' });
                    } else {
                        await bot.sendMessage(msg.chat.id, "📭 Заявок пока нет.");
                    }
                } else {
                    await bot.sendMessage(msg.chat.id, "⚙️ База данных не настроена в Vercel.");
                }
            } else {
                await bot.sendMessage(msg.chat.id, "Получено: " + text + ". Введите /help для списка команд.");
            }
        } catch (error) {
            console.error('Bot Request Error:', error);
            await bot.sendMessage(msg.chat.id, "❌ Ошибка бота: " + (error.message || "что-то пошло не так"));
        }
    }

    res.status(200).send('ok');
};
