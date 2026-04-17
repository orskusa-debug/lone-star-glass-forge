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
        const update = req.body;
        if (!update) return res.status(200).send('ok');
        const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

        if (update.callback_query) {
            const { data, message } = update.callback_query;
            const cid = message.chat.id;
            const lid = data.split('_')[1];
            if (data.startsWith('done_')) {
                await db.from('leads').update({ status: 'completed' }).eq('id', lid);
                await sendMsg(cid, `✅ Сделка [${lid}] готова!`);
            }
            return res.status(200).send('ok');
        }

        if (update.message && update.message.text) {
            const cid = update.message.chat.id;
            const text = update.message.text;
            if (text === '/start' || text === '/list') {
                const { data } = await db.from('leads').select('*').order('timestamp', { ascending: false }).limit(10);
                let r = "📋 *СПИСОК:*\n";
                data.forEach(l => { r += `${l.status==='completed'?'✅':'⏳'} [${l.id}] ${l.name}\n`; });
                await sendMsg(cid, r);
            } else {
                await sendMsg(cid, `🔔 Получено: ${text}`);
            }
        }
    } catch (e) { console.error(e); }
    res.status(200).send('ok');
};
