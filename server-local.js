require('dotenv').config();
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// Load environment variables
const token = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;

// Initialize Bot
let bot;
if (token) {
    bot = new TelegramBot(token, { polling: true });
    console.log('Telegram Bot initialized.');
}

const DATA_PATH = path.join(__dirname, 'data', 'leads.json');

// Helper to read/write leads
const getLeads = () => JSON.parse(fs.readFileSync(DATA_PATH, 'utf8') || '[]');
const saveLeads = (leads) => fs.writeFileSync(DATA_PATH, JSON.stringify(leads, null, 2));

// Generate unique 4-digit ID
const generateId = () => {
    const leads = getLeads();
    let id;
    do {
        id = Math.floor(1000 + Math.random() * 9000).toString();
    } while (leads.some(l => l.id === id));
    return id;
};

// PDF Invoice Helper
const generateInvoice = (lead) => {
    return new Promise((resolve) => {
        const doc = new PDFDocument({ margin: 50 });
        const filename = `invoice_${lead.id}.pdf`;
        const filePath = path.join(__dirname, filename);
        const stream = fs.createWriteStream(filePath);

        doc.pipe(stream);

        // Header
        doc.fontSize(20).text('LONE STAR GLASS FORGE', { align: 'left', bold: true });
        doc.fontSize(10).text('Premium Glass Contractor - Austin, TX', { align: 'left' });
        doc.moveDown();

        doc.fontSize(25).fillColor('#121212').text('INVOICE', { align: 'right' });
        doc.fontSize(10).fillColor('#666').text(`Invoice #: ${lead.id}`, { align: 'right' });
        doc.text(`Date: ${new Date().toLocaleDateString()}`, { align: 'right' });
        doc.moveDown(2);

        // Client Info
        doc.fillColor('#121212').fontSize(12).text('BILL TO:', { underline: true });
        doc.fontSize(14).text(lead.name);
        doc.fontSize(10).fillColor('#444').text(`Phone: ${lead.phone}`);
        if (lead.address) doc.text(`Address: ${lead.address}`);
        if (lead.zipcode) doc.text(`Zip: ${lead.zipcode}`);
        doc.moveDown(2);

        // Table Header
        const tableTop = 320;
        doc.fontSize(10).fillColor('#121212').text('Description', 50, tableTop, { bold: true });
        doc.text('Amount', 400, tableTop, { align: 'right', bold: true });
        doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).stroke();

        // Table Content
        const itemTop = tableTop + 25;
        doc.fontSize(10).fillColor('#444').text('On-site Design Consultation & Estimate', 50, itemTop);
        doc.fontSize(10).text('FREE', 400, itemTop, { align: 'right' });

        const workTop = itemTop + 25;
        doc.fontSize(11).fillColor('#121212').text('Custom Glass Installation Service & Materials', 50, workTop);
        doc.fontSize(11).text(`$${lead.price || '0.00'}`, 400, workTop, { align: 'right' });
        
        if (lead.info) {
            doc.fontSize(9).fillColor('#777').text(`Project Details: ${lead.info}`, 50, workTop + 15);
        }

        // Footer Total
        doc.moveTo(50, 450).lineTo(550, 450).stroke();
        doc.fontSize(15).fillColor('#121212').text('TOTAL DUE', 50, 470, { bold: true });
        doc.fontSize(15).text(`$${lead.price || '0.00'}`, 400, 470, { align: 'right', bold: true });

        // Payment Info
        doc.moveDown(5);
        doc.fontSize(10).fillColor('#666').text('Thank you for choosing Lone Star Glass Forge.', { align: 'center' });
        doc.text('Payment is due within 15 days of invoice date.', { align: 'center' });

        doc.end();
        stream.on('finish', () => resolve(filePath));
    });
};

// Excel Export Helper
const exportToExcel = async (leads, filename) => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Leads');
    worksheet.columns = [
        { header: 'ID', key: 'id', width: 10 },
        { header: 'Date', key: 'timestamp', width: 25 },
        { header: 'Name', key: 'name', width: 20 },
        { header: 'Phone', key: 'phone', width: 15 },
        { header: 'Zip Code', key: 'zipcode', width: 10 },
        { header: 'Address', key: 'address', width: 30 },
        { header: 'Price', key: 'price', width: 10 },
        { header: 'Status', key: 'status', width: 12 },
        { header: 'Message', key: 'message', width: 40 },
        { header: 'Info', key: 'info', width: 40 }
    ];
    leads.forEach(lead => worksheet.addRow(lead));
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0F0' } };
    const filePath = path.join(__dirname, filename);
    await workbook.xlsx.writeFile(filePath);
    return filePath;
};

// API: Handle Contact Form
app.post('/api/contact', async (req, res) => {
    const { name, phone, zipcode, message } = req.body;
    if (!name || !phone || !zipcode || !message) return res.status(400).json({ error: 'Missing fields.' });
    const newLead = {
        id: generateId(), name, phone, zipcode, address: '', message,
        timestamp: new Date().toISOString(), status: 'pending', price: 0, info: ''
    };
    const leads = getLeads();
    leads.push(newLead);
    saveLeads(leads);
    if (bot && chatId) {
        bot.sendMessage(chatId, `🔥 *New Lead [${newLead.id}]*\n👤 *${name}*\n📞 ${phone}\n📍 Zip: ${zipcode}\n📝 ${message}`, { parse_mode: 'Markdown' });
    }
    res.json({ success: true });
});

// Telegram Bot
if (bot) {
    bot.onText(/\/help/, (msg) => {
        if (msg.chat.id.toString() !== chatId) return;
        const resp = `🛠 *Bot Commands*\n\n` +
            `• \`/create Name Phone\`\n` +
            `• \`/phone ID Phone\`\n` +
            `• \`/address ID Address\`\n` +
            `• \`/price ID Value\`\n` +
            `• \`/info ID Text\`\n` +
            `• \`/invoice ID\` - Generate PDF Invoice\n` +
            `• \`/complete ID\`\n` +
            `• \`/id ID\`\n` +
            `• \`/find Name\`\n` +
            `• \`/list\`\n` +
            `• \`/excel\` / \`/excel_total\``;
        bot.sendMessage(chatId, resp, { parse_mode: 'Markdown' });
    });

    bot.onText(/\/invoice (\d{4})/, async (msg, match) => {
        if (msg.chat.id.toString() !== chatId) return;
        const lead = getLeads().find(l => l.id === match[1]);
        if (!lead) return bot.sendMessage(chatId, "❌ Not found.");
        const path = await generateInvoice(lead);
        bot.sendDocument(chatId, path, { caption: `📄 Invoice for ${lead.name} [ID: ${lead.id}]` }).then(() => {
            fs.unlinkSync(path);
        });
    });

    // Create / Update commands
    bot.onText(/\/create (.+?) (\d+)/, (msg, match) => {
        if (msg.chat.id.toString() !== chatId) return;
        const id = generateId();
        const leads = getLeads();
        leads.push({ id, name: match[1], phone: match[2], zipcode:'', address:'', message:'Manual', timestamp: new Date().toISOString(), status:'pending', price:0, info:'' });
        saveLeads(leads);
        bot.sendMessage(chatId, `✨ Created! ID: *${id}*`);
    });

    bot.onText(/\/phone (\d{4}) (\d+)/, (msg, match) => {
        if (msg.chat.id.toString() !== chatId) return;
        const leads = getLeads();
        const i = leads.findIndex(l => l.id === match[1]);
        if (i === -1) return bot.sendMessage(chatId, "❌ Not found.");
        leads[i].phone = match[2];
        saveLeads(leads);
        bot.sendMessage(chatId, `📞 Phone updated.`);
    });

    bot.onText(/\/address (\d{4}) (.+)/, (msg, match) => {
        if (msg.chat.id.toString() !== chatId) return;
        const leads = getLeads();
        const i = leads.findIndex(l => l.id === match[1]);
        if (i === -1) return bot.sendMessage(chatId, "❌ Not found.");
        leads[i].address = match[2];
        saveLeads(leads);
        bot.sendMessage(chatId, `🏠 Address updated.`);
    });

    bot.onText(/\/price (\d{4}) (\d+)/, (msg, match) => {
        if (msg.chat.id.toString() !== chatId) return;
        const leads = getLeads();
        const i = leads.findIndex(l => l.id === match[1]);
        if (i === -1) return bot.sendMessage(chatId, "❌ Not found.");
        leads[i].price = match[2];
        saveLeads(leads);
        bot.sendMessage(chatId, `💰 Price set: *${match[2]}*`);
    });

    bot.onText(/\/info (\d{4}) (.+)/, (msg, match) => {
        if (msg.chat.id.toString() !== chatId) return;
        const leads = getLeads();
        const i = leads.findIndex(l => l.id === match[1]);
        if (i === -1) return bot.sendMessage(chatId, "❌ Not found.");
        leads[i].info = match[2];
        saveLeads(leads);
        bot.sendMessage(chatId, `📝 Info updated.`);
    });

    bot.onText(/\/id (\d{4})/, (msg, match) => {
        if (msg.chat.id.toString() !== chatId) return;
        const lead = getLeads().find(l => l.id === match[1]);
        if (!lead) return bot.sendMessage(chatId, "❌ Not found.");
        const resp = `📄 *Info [${lead.id}]*\n👤 *Name:* ${lead.name}\n📞 *Phone:* ${lead.phone}\n🏠 *Address:* ${lead.address}\n💰 *Price:* ${lead.price}\n📝 *Notes:* ${lead.info}\n🚦 *Status:* ${lead.status.toUpperCase()}`;
        bot.sendMessage(chatId, resp, { parse_mode: 'Markdown' });
    });

    bot.onText(/\/list/, (msg) => {
        if (msg.chat.id.toString() !== chatId) return;
        const leads = getLeads();
        let resp = "📋 *Last Leads:*\n\n";
        leads.slice(-10).forEach(l => resp += `${l.status === 'pending'?'⏳':'✅'} [${l.id}] *${l.name}*\n`);
        bot.sendMessage(chatId, resp, { parse_mode: 'Markdown' });
    });

    bot.onText(/\/excel/, async (msg) => {
        if (msg.chat.id.toString() !== chatId) return;
        const path = await exportToExcel(getLeads().filter(l => new Date(l.timestamp).getMonth() === new Date().getMonth()), 'month.xlsx');
        bot.sendDocument(chatId, path).then(() => fs.unlinkSync(path));
    });

    bot.onText(/\/excel_total/, async (msg) => {
        if (msg.chat.id.toString() !== chatId) return;
        const path = await exportToExcel(getLeads(), 'total.xlsx');
        bot.sendDocument(chatId, path).then(() => fs.unlinkSync(path));
    });
}

// Start Server
app.listen(port, () => console.log(`Server at http://localhost:${port}`));
