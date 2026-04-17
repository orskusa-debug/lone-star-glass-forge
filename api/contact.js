const https = require('https');
const { createClient } = require('@supabase/supabase-js');

function sendMsg(cid, text, markup = null) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify({ chat_id: cid, text, parse_mode: 'Markdown', reply_markup: markup });
        const options = {
            hostname: 'api.telegram.org', port: 443,
            path: `/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
        };
        const req = https.request(options, (res) => {
            res.on('data', () => {}); res.on('end', () => resolve());
        });
        req.on('error', (e) => reject(e)); req.write(data); req.end();
    });
}

module.exports = async (req, res) => {
    try {
        const { name, phone, zipcode, message } = req.body;
        const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
        const id = Math.floor(1000 + Math.random() * 9000).toString();
        
        await db.from('leads').insert([{ id, name, phone, zipcode, message }]);
        await sendMsg(process.env.TELEGRAM_CHAT_ID, `🔥 *ЗАЯВКА [${id}]*\n👤 ${name}\n📞 ${phone}`, {
            inline_keyboard: [[ { text: '✅ Готово', callback_data: `done_${id}` } ]]
        });
        
        res.status(200).json({ success: true });
    } catch (e) { res.status(500).send(e.message); }
};
