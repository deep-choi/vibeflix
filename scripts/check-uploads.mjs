import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';

const origin = process.argv[2] || 'http://127.0.0.1:5173';
if (!['127.0.0.1', 'localhost'].includes(new URL(origin).hostname)) throw new Error('Integration checks write disposable records and must only run against a local preview.');
const send = (path, options = {}) => fetch(origin + path, options);

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = buffer => { let c = 0xffffffff; for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function png(width, height) {
  const chunk = (type, data) => { const body = Buffer.concat([Buffer.from(type), data]); const out = Buffer.alloc(body.length + 8); out.writeUInt32BE(data.length, 0); body.copy(out, 4); out.writeUInt32BE(crc32(body), body.length + 4); return out; };
  const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header.set([8, 2, 0, 0, 0], 8);
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 0x40)]);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', deflateSync(Buffer.concat(Array(height).fill(row)))), chunk('IEND', Buffer.alloc(0))]);
}
const uri = (buffer, type = 'png') => `data:image/${type};base64,${buffer.toString('base64')}`;

const signIn = await send('/signin-with-chatgpt?return_to=/', { redirect: 'manual' });
const cookie = signIn.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
assert.ok(cookie, 'Local mock sign-in should provide a cookie');
const headers = { 'Content-Type': 'application/json', Origin: origin, Cookie: cookie };
const post = body => send('/api/projects', { method: 'POST', headers, body: JSON.stringify(body) });
const unique = `https://example.com/vibeflix-upload-qa-${crypto.randomUUID()}`;
const base = { title: 'Upload QA', creator: 'QA', description: 'Cover and gallery upload check', type: 'art', url: unique.replace('https://', '') };

// Cover rules: exact size only
assert.equal((await post({ ...base, image: uri(png(1920, 1080)) })).status, 400, 'Wrong cover size must be rejected');
assert.equal((await post({ ...base, image: uri(png(720, 720)) })).status, 400, 'Square cover must be rejected');
assert.equal((await post({ ...base, image: 'data:image/png;base64,' + Buffer.from('not an image').toString('base64') })).status, 400, 'Fake image must be rejected');
assert.equal((await post({ ...base, image: 'https://example.com/cover.jpg' })).status, 400, 'External cover links are no longer accepted');
// Gallery rules
assert.equal((await post({ ...base, gallery: Array(5).fill(uri(png(200, 100))) })).status, 400, 'More than four description images must be rejected');
assert.equal((await post({ ...base, gallery: ['data:image/png;base64,AAAA'] })).status, 400, 'Invalid description image must be rejected');
assert.equal((await post({ ...base, type: 'poem' })).status, 400, 'Unknown categories must be rejected');

let id;
try {
  const created = await post({ ...base, image: uri(png(1280, 720)), gallery: [uri(png(300, 200)), uri(png(200, 300))] });
  const payload = await created.json();
  assert.equal(created.status, 201, JSON.stringify(payload).slice(0, 300));
  id = payload.project.id;
  assert.equal(payload.project.url, unique, 'A link typed without https:// is normalised');
  assert.equal(payload.project.type, 'art');
  assert.equal(payload.project.gallery.length, 2);

  const list = (await (await send('/api/projects')).json()).projects.find(p => p.id === id);
  assert.ok(list, 'New-category project must be listed');
  assert.match(list.image, /^\/api\/projects\/.+\/cover\?v=\d+$/, 'List exposes a cover URL, not the data URL');
  assert.equal(list.gallery.length, 2);
  const cover = await send(list.image);
  assert.equal(cover.status, 200); assert.equal(cover.headers.get('content-type'), 'image/png');
  assert.equal((await cover.arrayBuffer()).byteLength, png(1280, 720).length);
  const first = await send(list.gallery[0]);
  assert.equal(first.status, 200); assert.equal(first.headers.get('content-type'), 'image/png');

  // Edit: keep the second image, add a new one in front, drop the first; omit image to keep the cover
  const keepId = list.gallery[1].split('/').pop();
  const edit = body => send(`/api/projects/${id}`, { method: 'PATCH', headers, body: JSON.stringify(body) });
  const edited = await edit({ ...base, type: 'novel', gallery: [uri(png(120, 90)), keepId] });
  assert.equal(edited.status, 200, JSON.stringify(await edited.clone().json()));
  const after = (await (await send('/api/projects')).json()).projects.find(p => p.id === id);
  assert.equal(after.type, 'novel'); assert.equal(after.gallery.length, 2);
  assert.equal(after.gallery[1].split('/').pop(), keepId, 'Kept image stays, now second');
  assert.equal((await send(list.gallery[0])).status, 404, 'Removed image is gone');
  assert.equal((await send(after.image)).status, 200, 'Cover is kept when image is omitted');
  assert.equal((await edit({ ...base, gallery: ['img-someone-elses-image'] })).status, 400, 'Unknown image ids are rejected');
  assert.equal((await edit({ ...base, gallery: [] })).status, 200);
  assert.equal((await (await send('/api/projects')).json()).projects.find(p => p.id === id).gallery.length, 0);
  assert.equal((await edit({ ...base, image: '' })).status, 200);
  assert.equal((await (await send('/api/projects')).json()).projects.find(p => p.id === id).image, '', 'Cover can be removed');
} finally {
  if (id) assert.equal((await send(`/api/projects/${id}`, { method: 'DELETE', headers })).status, 200);
}
console.log('PASS: link normalisation, new categories, exact-size cover validation, description images (create, keep, reorder, remove), cover removal.');
