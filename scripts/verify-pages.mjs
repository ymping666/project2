import assert from 'node:assert/strict';
import { access, readFile, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const docs = path.join(root, 'docs');
const prefix = '/project2';
let pages = 0, links = 0, dynamicPaths = 0, totalBytes = 0, studyPages = 0;
async function checkRoute(route) {
  assert.ok(route.startsWith(prefix + '/'), `Unprefixed route: ${route}`);
  const pathname = route.slice(prefix.length).split(/[?#]/)[0];
  const target = path.join(docs, pathname, pathname.endsWith('/') ? 'index.html' : '');
  assert.ok(path.resolve(target).startsWith(docs + path.sep));
  await access(target);
}
async function checkData(value, navigable = true) {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (key === 'path') {
      assert.ok(child.startsWith(prefix + '/'), `Unprefixed data route: ${child}`);
      if (navigable) { await checkRoute(child); dynamicPaths++; }
    } else await checkData(child, navigable && key !== 'comparison');
  }
}
async function visit(directory) {
  for (const file of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, file.name);
    if (file.isDirectory()) { await visit(filename); continue; }
    totalBytes += (await stat(filename)).size;
    if (!file.name.endsWith('.html')) continue;
    pages++;
    const html = await readFile(filename, 'utf8');
    assert.match(html, /name="robots" content="noindex,nofollow"/);
    for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
      if (match[1].startsWith('#')) continue;
      await checkRoute(match[1]); links++;
    }
    const data = html.match(/<script id="page-data" type="application\/json">([\s\S]*?)<\/script>/)?.[1];
    if (data) {
      const parsed = JSON.parse(data);
      if (parsed.entry) { studyPages++; assert.equal(parsed.catalog, undefined, 'Study page embeds full catalog'); }
      await checkData(parsed);
    }
  }
}
await visit(docs);
assert.equal(pages, 548);
assert.equal(studyPages, 540);
assert.ok(totalBytes < 35 * 1024 * 1024, 'Pages output exceeds 35 MiB');
const manifest = JSON.parse(await readFile(path.join(docs, 'manifest.json'), 'utf8'));
assert.equal(manifest.entries.length, 540);
await checkData(manifest);
await access(path.join(docs, '.nojekyll'));
console.log(JSON.stringify({ pass: true, html: pages, studyPages, checkedLinks: links, checkedDynamicPaths: dynamicPaths, totalBytes, prefix }));
