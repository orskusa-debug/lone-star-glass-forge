const TelegramBot = require('node-telegram-bot-api');

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { name, phone, zipcode, message } = req.body;
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!token || !chatId) {
        return res.status(500).json({ error: 'Telegram configuration missing' });
    }

    const bot = new TelegramBot(token);

    try {
        const text = `🔥 *Новая заявка*\n👤 *Имя:* ${name}\n📞 *Телефон:* ${phone}\n📍 *Zip:* ${zipcode}\n📝 *Сообщение:* ${message}`;
        await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
        
        return res.status(200).json({ success: true });
    } catch (error) {
        console.error('Telegram Error:', error);
        return res.status(500).json({ error: 'Failed to send message to Telegram' });
    }
}
