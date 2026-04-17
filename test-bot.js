const http = require('http');

const data = JSON.stringify({
    message: {
        chat: { id: 406307970 },
        text: '/list'
    }
});

const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/bot',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
    }
};

const req = http.request(options, (res) => {
    console.log(`Статус ответа сервера: ${res.statusCode}`);
    res.on('data', (d) => {
        process.stdout.write(d);
    });
});

req.on('error', (error) => {
    console.error('Ошибка теста:', error);
});

req.write(data);
req.end();
console.log('🚀 Отправляем симуляцию команды /list боту...');
