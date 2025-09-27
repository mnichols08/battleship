const http = require('http');
const { startServer } = require('../server');

(async () => {
  const listener = await startServer(0);
  const address = listener.address();
  const port = typeof address === 'string' ? 80 : address.port;

  const options = {
    hostname: '127.0.0.1',
    port,
    path: '/',
    method: 'GET',
  };

  const request = http.request(options, (res) => {
    let rawData = '';
    res.setEncoding('utf8');
    res.on('data', (chunk) => {
      rawData += chunk;
    });
    res.on('end', () => {
      const statusOk = res.statusCode === 200;
      const containsApp = rawData.includes('<game-app');
      if (statusOk && containsApp) {
        console.log('Smoke test passed: index.html served.');
        listener.close(() => {
          process.exit(0);
        });
      } else {
        console.error('Smoke test failed: unexpected response.');
        listener.close(() => {
          process.exit(1);
        });
      }
    });
  });

  request.on('error', (err) => {
    console.error('Smoke test encountered an error:', err);
    listener.close(() => {
      process.exit(1);
    });
  });

  request.end();
})();
