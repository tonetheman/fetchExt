'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const fetchExt = require('./index.js');

// ---------------------------------------------------------------------------
// Minimal HTTP server used by integration tests
// ---------------------------------------------------------------------------

let server;
let baseUrl;

before(
  () =>
    new Promise((resolve) => {
      server = http.createServer((req, res) => {
        if (req.url === '/json') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ hello: 'world', n: 42 }));
        } else if (req.url === '/text') {
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.end('hello text');
        } else if (req.url === '/empty') {
          res.writeHead(204);
          res.end();
        } else {
          res.writeHead(404);
          res.end('not found');
        }
      });
      server.listen(0, '127.0.0.1', () => {
        const { port } = server.address();
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    })
);

after(() => new Promise((resolve) => server.close(resolve)));

// ---------------------------------------------------------------------------
// Unit tests using wrapResponse directly (no network needed)
// ---------------------------------------------------------------------------

describe('wrapResponse', () => {
  const makeResponse = (body, init = {}) =>
    fetchExt.wrapResponse(new Response(body, init));

  test('text() returns body string', async () => {
    const res = makeResponse('hello');
    assert.equal(await res.text(), 'hello');
  });

  test('text() can be called multiple times', async () => {
    const res = makeResponse('hello');
    assert.equal(await res.text(), 'hello');
    assert.equal(await res.text(), 'hello');
    assert.equal(await res.text(), 'hello');
  });

  test('json() parses body', async () => {
    const res = makeResponse(JSON.stringify({ a: 1 }), {
      headers: { 'Content-Type': 'application/json' },
    });
    assert.deepEqual(await res.json(), { a: 1 });
  });

  test('json() can be called multiple times', async () => {
    const res = makeResponse(JSON.stringify({ a: 1 }));
    assert.deepEqual(await res.json(), { a: 1 });
    assert.deepEqual(await res.json(), { a: 1 });
  });

  test('json() and text() can be interleaved', async () => {
    const payload = { x: 'y' };
    const res = makeResponse(JSON.stringify(payload));
    const text = await res.text();
    const parsed = await res.json();
    assert.deepEqual(parsed, payload);
    assert.equal(text, JSON.stringify(payload));
  });

  test('parallel calls share a single underlying read', async () => {
    const res = makeResponse('data');
    const [a, b, c] = await Promise.all([res.text(), res.text(), res.text()]);
    assert.equal(a, 'data');
    assert.equal(b, 'data');
    assert.equal(c, 'data');
  });

  test('arrayBuffer() returns bytes', async () => {
    const res = makeResponse('abc');
    const buf = await res.arrayBuffer();
    assert.ok(buf instanceof ArrayBuffer);
    assert.equal(buf.byteLength, 3);
  });

  test('arrayBuffer() returns a copy each call', async () => {
    const res = makeResponse('abc');
    const buf1 = await res.arrayBuffer();
    const buf2 = await res.arrayBuffer();
    assert.notEqual(buf1, buf2); // different objects
    assert.equal(buf1.byteLength, buf2.byteLength);
  });

  test('blob() returns a Blob', async () => {
    const res = makeResponse('blobdata', {
      headers: { 'Content-Type': 'text/plain' },
    });
    const blob = await res.blob();
    assert.ok(blob instanceof Blob);
    assert.equal(blob.size, 8);
  });

  test('blob() can be called after text()', async () => {
    const res = makeResponse('hi', { headers: { 'Content-Type': 'text/plain' } });
    await res.text();
    const blob = await res.blob();
    assert.ok(blob instanceof Blob);
  });

  test('status and headers pass through', () => {
    const res = makeResponse('', {
      status: 201,
      headers: { 'X-Custom': 'yes' },
    });
    assert.equal(res.status, 201);
    assert.equal(res.headers.get('x-custom'), 'yes');
  });

  test('ok reflects status', () => {
    assert.equal(makeResponse('', { status: 200 }).ok, true);
    assert.equal(makeResponse('', { status: 404 }).ok, false);
  });

  test('bodyUsed is always false on wrapped response', () => {
    const res = makeResponse('hi');
    assert.equal(res.bodyUsed, false);
  });

  test('clone() produces independent re-readable response', async () => {
    const res = makeResponse('original');
    const cloned = res.clone();
    assert.equal(await res.text(), 'original');
    assert.equal(await cloned.text(), 'original');
    assert.equal(await res.text(), 'original'); // still readable after clone consumed
  });
});

// ---------------------------------------------------------------------------
// Integration tests (real HTTP requests)
// ---------------------------------------------------------------------------

describe('fetchExt (integration)', () => {
  test('fetches JSON and reads it twice', async () => {
    const res = await fetchExt(`${baseUrl}/json`);
    const first = await res.json();
    const second = await res.json();
    assert.deepEqual(first, { hello: 'world', n: 42 });
    assert.deepEqual(second, { hello: 'world', n: 42 });
  });

  test('reads json() then text() from same response', async () => {
    const res = await fetchExt(`${baseUrl}/json`);
    const obj = await res.json();
    const txt = await res.text();
    assert.equal(obj.hello, 'world');
    assert.ok(txt.includes('world'));
  });

  test('fetches plain text and reads it twice', async () => {
    const res = await fetchExt(`${baseUrl}/text`);
    assert.equal(await res.text(), 'hello text');
    assert.equal(await res.text(), 'hello text');
  });

  test('status is preserved', async () => {
    const res = await fetchExt(`${baseUrl}/json`);
    assert.equal(res.status, 200);
    assert.equal(res.ok, true);
  });

  test('404 response is accessible', async () => {
    const res = await fetchExt(`${baseUrl}/missing`);
    assert.equal(res.status, 404);
    assert.equal(res.ok, false);
    const txt = await res.text();
    assert.equal(txt, 'not found');
  });
});
