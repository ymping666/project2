import { spawnSync } from 'node:child_process';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const prefix = '/project2';
const output = path.join(root, 'docs');
const build = spawnSync(process.execPath, ['build.mjs'], { cwd: root, stdio: 'inherit' });
if (build.status !== 0) throw Error('Local build failed');
if (path.dirname(output) !== root || path.basename(output) !== 'docs') throw Error('Unsafe Pages output');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(path.join(root, 'dist'), output, { recursive: true });

const route = value => typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? prefix + value : value;
const rewriteData = text => JSON.stringify(JSON.parse(text, (key, value) => key === 'path' ? route(value) : value)).replaceAll('<', '\\u003c');
async function visit(directory) {
  for (const file of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, file.name);
    if (file.isDirectory()) { await visit(filename); continue; }
    if (file.name.endsWith('.html')) {
      let html = await readFile(filename, 'utf8');
      html = html.replace(/((?:href|src)=")\/(?!\/)/g, `$1${prefix}/`);
      html = html.replace(/(<script id="page-data" type="application\/json">)([\s\S]*?)(<\/script>)/g,
        (_, start, data, end) => start + rewriteData(data) + end);
      await writeFile(filename, html);
    } else if (file.name === 'manifest.json') {
      await writeFile(filename, rewriteData(await readFile(filename, 'utf8')));
    }
  }
}
await visit(output);
await writeFile(path.join(output, '.nojekyll'), '');
console.log(`GitHub Pages preview: https://ymping666.github.io${prefix}/ (noindex)`);
