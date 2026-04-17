const http = require('http');

const data = JSON.stringify({
    name: 'Zip Tester',
    phone: '512-555-9999',
    zipcode: '78704',
    message: 'Need a price for a frameless shower door.'
});

const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/contact',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
    }
};

const req = http.request(options, (res) => {
    console.log(`Status: ${res.statusCode}`);
    res.on('data', (d) => {
        process.stdout.write(d);
    });
});

req.on('error', (e) => {
    console.error(e);
});

req.write(data);
req.end();
