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
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_KEY;

    // Инициализируем Supabase если есть ключи
    let supabase = null;
    if (supabaseUrl && supabaseKey) {
        const { createClient } = require('@supabase/supabase-js');
        supabase = createClient(supabaseUrl, supabaseKey);
    }

    // Инициализируем бота
    const bot = new TelegramBot(token);

    try {
        const leadId = Math.floor(1000 + Math.random() * 9000).toString();
        
        // 1. Сохраняем в базу данных
        if (supabase) {
            const { error } = await supabase.from('leads').insert([{
                id: leadId, name, phone, zipcode, message, status: 'pending'
            }]);
            if (error) console.error('Supabase Save Error:', error);
        }

        // 2. Отправляем в Telegram
        const text = `🔥 *НОВАЯ ЗАЯВКА [ID: ${leadId}]*\n\n👤 *Имя:* ${name}\n📞 *Телефон:* ${phone}\n📍 *Zip:* ${zipcode}\n📝 *Сообщение:* ${message}`;
        
        await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
        
        return res.status(200).json({ success: true, id: leadId });
    } catch (error) {
        console.error('Telegram API Error:', error.message || error);
        return res.status(500).json({ 
            success: false, 
            error: 'Ошибка при отправке в Telegram. Проверьте правильность токена и ID чата.',
            details: error.message 
        });
    }
};
