const TelegramBot = require('node-telegram-bot-api');

module.exports = async (req, res) => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (req.method === 'POST') {
        const { message } = req.body;
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_KEY;

        if (message && message.text) {
            const bot = new TelegramBot(token);
            const text = message.text;

            // Обработка команд
            if (text === '/start' || text === '/help') {
                await bot.sendMessage(message.chat.id, 
                    "🛠 *Lone Star CRM (Supabase)*\n\n" +
                    "Я подключен к базе данных! Команды:\n" +
                    "• /list — последние 10 заявок\n" +
                    "• /help — эта справка", 
                    { parse_mode: 'Markdown' }
                );
            } else if (text === '/list') {
                if (supabaseUrl && supabaseKey) {
                    const { createClient } = require('@supabase/supabase-js');
                    const supabase = createClient(supabaseUrl, supabaseKey);
                    
                    const { data, error } = await supabase
                        .from('leads')
                        .select('id, name, status')
                        .order('timestamp', { ascending: false })
                        .limit(10);

                    if (error) {
                        await bot.sendMessage(message.chat.id, "❌ Ошибка базы данных.");
                    } else if (data && data.length > 0) {
                        let resp = "📋 *Последние заявки:*\n\n";
                        data.forEach(l => {
                            resp += `${l.status === 'pending' ? '⏳' : '✅'} [${l.id}] *${l.name}*\n`;
                        });
                        await bot.sendMessage(message.chat.id, resp, { parse_mode: 'Markdown' });
                    } else {
                        await bot.sendMessage(message.chat.id, "📭 Заявок пока нет.");
                    }
                } else {
                    await bot.sendMessage(message.chat.id, "⚙️ База данных не настроена в Vercel.");
                }
            } else {
                await bot.sendMessage(message.chat.id, "Я получил: " + text + ". Используйте /help для списка команд.");
            }
        }
        res.status(200).send('ok');
    } else {
        res.status(200).send('Бот активен и готов к работе через Webhook.');
    }
};
