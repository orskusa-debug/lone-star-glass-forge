const https = require('https');

const token = '8705015896:AAFfQTJuB7Vk2i2WmliEAQxaZUQRR6hMjFM';
const url = 'https://lone-star-glass-forge.vercel.app/api/bot';

https.get(`https://api.telegram.org/bot${token}/setWebhook?url=${url}`, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
        console.log('Ответ от Telegram:', JSON.parse(data));
    });
}).on('error', (err) => {
    console.error('Ошибка:', err.message);
});
