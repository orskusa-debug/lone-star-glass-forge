require('dotenv').config();
const app = require('./index.js');
const port = 3000;

app.listen(port, () => {
    console.log(`🚀 Сервер запущен локально!`);
    console.log(`🔗 Сайт: http://localhost:${port}`);
    console.log(`✅ Переменные окружения загружены из .env`);
});
