const https = require('https');

const baseUrl = 'https://push.yolo.ccwu.cc';
const paths = [
    '/wxpush',
    '/push',
    '/send',
    '/api/send',
    '/api/push',
    '/api/v1/send',
    '/api/v1/push',
    '/message/send',
    '/api/message/send',
    '/v1/message/send',
    '/api/v1/message/send',
    '/api/reminders/trigger' // Just in case
];

async function checkPath(path) {
    return new Promise((resolve) => {
        const url = `${baseUrl}${path}`;
        const req = https.request(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        }, (res) => {
            console.log(`Path: ${path} -> Status: ${res.statusCode}`);
            resolve();
        });

        req.on('error', (e) => {
            console.log(`Path: ${path} -> Error: ${e.message}`);
            resolve();
        });

        req.write('{}');
        req.end();
    });
}

async function run() {
    for (const path of paths) {
        await checkPath(path);
    }
}

run();
