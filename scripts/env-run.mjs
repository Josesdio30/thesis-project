#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { loadProjectEnv } from './lib/load-env.cjs';
loadProjectEnv();
const args = process.argv.slice(2);
if (!args.length) {
  console.error('Usage: node scripts/env-run.mjs <node-script> [args...]');
  process.exit(1);
}
const child = spawn(process.execPath, args, { stdio: 'inherit', env: process.env });
const forwarders = new Map(['SIGINT', 'SIGTERM'].map(signal => [signal, () => child.kill(signal)]));
for (const [signal, handler] of forwarders) process.on(signal, handler);
child.on('error', () => { console.error('Could not start command'); process.exitCode = 1; });
child.on('exit', (code, signal) => {
  for (const [name, handler] of forwarders) process.removeListener(name, handler);
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
