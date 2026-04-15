import app from '../index.js';

async function run() {
  const port = 0; // ephemeral
  const server = app.listen(port, async () => {
    try {
      const addr = server.address();
      const actualPort = typeof addr === 'string' ? addr : addr && (addr as any).port;
      const res = await fetch(`http://127.0.0.1:${actualPort}/health`);
      if (res.status === 200) {
        console.log('Sentinel smoke: /health OK');
        server.close();
        process.exit(0);
      } else {
        console.error('Sentinel smoke: /health returned', res.status);
        server.close();
        process.exit(2);
      }
    } catch (err) {
      console.error('Sentinel smoke: error', err);
      server.close();
      process.exit(2);
    }
  });
}

run();
