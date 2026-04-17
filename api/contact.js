const TelegramBot = require('node-telegram-bot-api');

module.exports = async (req, res) => {
    // Включаем CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { name, phone, zipcode, message } = req.body;
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!token || !chatId) {
        console.error('Missing Env Vars:', { token: !!token, chatId: !!chatId });
        return res.status(500).json({ error: 'Конфигурация Telegram не настроена в Vercel (Environment Variables)' });
    }

    // Инициализируем бота без поллинга (это важно для функций)
    const bot = new TelegramBot(token);

    try {
        const text = `🔥 *НОВАЯ ЗАЯВКА*\n\n👤 *Имя:* ${name}\n📞 *Телефон:* ${phone}\n📍 *Zip:* ${zipcode}\n📝 *Сообщение:* ${message}`;
        
        await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
        console.log('Message sent successfully to:', chatId);
        
        return res.status(200).json({ success: true });
    } catch (error) {
        console.error('Telegram API Error:', error.message || error);
        return res.status(500).json({ 
            success: false, 
            error: 'Ошибка при отправке в Telegram. Проверьте правильность токена и ID чата.',
            details: error.message 
        });
    }
};
