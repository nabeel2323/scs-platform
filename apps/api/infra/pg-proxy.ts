/**
 * Local TCP → Docker Postgres proxy
 *
 * Docker Desktop for Windows rewrites source IPs during port forwarding,
 * breaking the PostgreSQL wire protocol for Node.js clients (pg, postgres.js).
 *
 * This proxy listens on a local TCP port and tunnels connections to the
 * Postgres container via `docker exec`, preserving the protocol correctly.
 *
 * Usage: npx tsx infra/pg-proxy.ts
 * Then set DATABASE_URL=postgresql://scs@127.0.0.1:15432/scs_platform
 */

import * as net from 'node:net';
import { spawn } from 'node:child_process';

const LISTEN_PORT = parseInt(process.env['PROXY_PORT'] || '15432', 10);
const CONTAINER = 'scs-postgres';
const DB_PORT = 5432;

const server = net.createServer((localSocket) => {
  const dockerExec = spawn('docker', [
    'exec', '-i', CONTAINER,
    'bash', '-c', `exec 3<>/dev/tcp/127.0.0.1/${DB_PORT}; cat <&3 & cat >&3; wait`,
  ], { stdio: ['pipe', 'pipe', 'pipe'] });

  const remoteStdin = dockerExec.stdin;
  const remoteStdout = dockerExec.stdout;

  localSocket.pipe(remoteStdin);
  remoteStdout.pipe(localSocket);

  remoteStdout.on('end', () => localSocket.end());
  localSocket.on('end', () => { remoteStdin.end(); });

  localSocket.on('error', () => { dockerExec.kill(); });
  dockerExec.on('error', () => { localSocket.destroy(); });
  dockerExec.on('close', () => { localSocket.destroy(); });

  // Suppress stderr noise from docker
  dockerExec.stderr.on('data', () => {});
});

server.listen(LISTEN_PORT, '127.0.0.1', () => {
  console.log(`🔌 PG proxy listening on 127.0.0.1:${LISTEN_PORT}`);
  console.log(`   → ${CONTAINER}:${DB_PORT}`);
  console.log(`   DATABASE_URL=postgresql://scs:scs_dev_2026@127.0.0.1:${LISTEN_PORT}/scs_platform\n`);
});
