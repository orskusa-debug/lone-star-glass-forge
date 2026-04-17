const { createClient } = require('@supabase/supabase-js');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

module.exports = async (req, res) => {
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

    const sendMessage = async (messageText) => {
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: messageText, parse_mode: 'Markdown' })
        });
    };

    const sendDocument = async (buffer, filename) => {
        const formData = new FormData();
        formData.append('chat_id', chatId);
        formData.append('document', new Blob([buffer]), filename);
        await fetch(`https://api.telegram.org/bot${token}/sendDocument`, { method: 'POST', body: formData });
    };

    try {
        const args = text.split(' ');
        const command = args[0].toLowerCase();

        if (command === '/start' || command === '/help') {
            const helpText = 
                "🛠 *Lone Star CRM Dashboard*\n\n" +
                "📋 *Управление заказами:*\n" +
                "/list - последние 10 заявок\n" +
                "/complete [id] - отметить как выполненный\n" +
                "/invoice [id] - создать PDF счет\n\n" +
                "📊 *Отчетность:*\n" +
                "/stats - статистика\n" +
                "/excel - выгрузить базу в Excel\n\n" +
                "ℹ️ _Напишите /complete 1234, чтобы закрыть заявку_";
            await sendMessage(helpText);
        } 
        else if (command === '/list') {
            const { data, error } = await supabase.from('leads').select('id, name, status').order('timestamp', { ascending: false }).limit(10);
            if (error) throw error;
            let resp = "📋 *Последние заявки:*\n\n";
            data.forEach(l => { resp += `${l.status === 'pending' ? '⏳' : '✅'} [${l.id}] *${l.name}*\n`; });
            await sendMessage(resp || "📭 Заявок нет.");
        } 
        else if (command === '/complete') {
            const id = args[1];
            if (!id) return await sendMessage("❌ Укажите ID: `/complete 1234` ");
            const { error } = await supabase.from('leads').update({ status: 'completed' }).eq('id', id);
            if (error) throw error;
            await sendMessage(`✅ Заявка [${id}] отмечена как выполненная!`);
        }
        else if (command === '/stats') {
            const { data, error } = await supabase.from('leads').select('status');
            if (error) throw error;
            const s = data.reduce((acc, c) => { acc[c.status] = (acc[c.status] || 0) + 1; return acc; }, {});
            await sendMessage(`📊 *Статистика:*\n⏳ Ожидают: ${s.pending || 0}\n✅ Готово: ${s.completed || 0}\nВсего: ${data.length}`);
        }
        else if (command === '/excel') {
            const { data, error } = await supabase.from('leads').select('*').order('timestamp', { ascending: false });
            if (error) throw error;
            const workbook = new ExcelJS.Workbook();
            const ws = workbook.addWorksheet('Leads');
            ws.columns = [{header:'ID',key:'id'},{header:'Name',key:'name'},{header:'Phone',key:'phone'},{header:'Status',key:'status'}];
            ws.addRows(data);
            const buffer = await workbook.xlsx.writeBuffer();
            await sendDocument(buffer, 'Report.xlsx');
        }
        else if (command === '/invoice') {
            const id = args[1];
            if (!id) return await sendMessage("❌ Укажите ID: `/invoice 1234` ");
            const { data, error } = await supabase.from('leads').select('*').eq('id', id).single();
            if (error || !data) throw new Error("Заявка не найдена");

            const doc = new PDFDocument();
            const chunks = [];
            doc.on('data', c => chunks.push(c));
            doc.fontSize(25).text('Lone Star Glass Forge', 100, 80);
            doc.fontSize(15).text(`INVOICE #${data.id}`, 100, 130);
            doc.text(`Customer: ${data.name}`, 100, 160);
            doc.text(`Phone: ${data.phone}`, 100, 180);
            doc.text(`Description: Glass Project`, 100, 210);
            doc.end();
            
            // Ждем завершения генерации PDF
            const buffer = await new Promise((resolve) => { doc.on('end', () => resolve(Buffer.concat(chunks))); });
            await sendDocument(buffer, `Invoice_${id}.pdf`);
        }
    } catch (error) {
        console.error('Bot Error:', error);
        await sendMessage("❌ Ошибка: " + error.message);
    }
    res.status(200).send('ok');
};
