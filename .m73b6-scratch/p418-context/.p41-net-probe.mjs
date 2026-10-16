// Temporary Phase 4.1 probe: is the npm registry reachable from inside a build container?
import https from 'node:https';

const req = https.get('https://registry.npmjs.org/-/ping', { timeout: 8000 }, (res) => {
  console.log('NET_STATUS', res.statusCode);
  process.exit(0);
});
req.on('timeout', () => { console.log('NET_TIMEOUT'); process.exit(0); });
req.on('error', (e) => { console.log('NET_ERROR', e.code || e.message); process.exit(0); });
