const express = require('express');
const path = require('path');
const app = express();

// Раздаем статические файлы из папки public
app.use(express.static(path.join(__dirname, 'public')));

// Все остальные запросы (кроме /api) перенаправляем на index.html
app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

module.exports = app;
