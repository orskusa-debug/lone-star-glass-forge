const TelegramBot = require('node-telegram-bot-api');

module.exports = async (req, res) => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (req.method === 'POST') {
        const { message } = req.body;

        if (message && message.text) {
            const bot = new TelegramBot(token);
            const text = message.text;

            // Обработка команд
            if (text === '/start' || text === '/help') {
                await bot.sendMessage(message.chat.id, 
                    "🛠 *Lone Star Bot (Vercel Edition)*\n\n" +
                    "Я работаю в режиме Webhook! Пока я могу:\n" +
                    "• Присылать уведомления с сайта\n" +
                    "• Отвечать на /help\n\n" +
                    "_Для полноценной работы /list и отчетов нужно подключить базу данных_", 
                    { parse_mode: 'Markdown' }
                );
            } else {
                await bot.sendMessage(message.chat.id, "Я получил ваше сообщение: " + text);
            }
        }
        res.status(200).send('ok');
    } else {
        res.status(200).send('Бот активен и готов к работе через Webhook.');
    }
};
