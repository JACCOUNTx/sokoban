// Copies the deployable web files into www/ for Capacitor (webDir).
// Keep index.html / privacy.html / src as the single source of truth.
import { cp, mkdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();
const out = join(root, 'www');

const required = ['index.html', 'privacy.html', 'src'];
for (const entry of required) {
  await stat(join(root, entry)).catch(() => {
    throw new Error(`missing web asset: ${entry}`);
  });
}

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await cp(join(root, 'index.html'), join(out, 'index.html'));
await cp(join(root, 'privacy.html'), join(out, 'privacy.html'));
await cp(join(root, 'src'), join(out, 'src'), { recursive: true });

console.log(`www ready → ${out}`);
