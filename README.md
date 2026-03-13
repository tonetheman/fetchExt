# fetchExt

A drop-in replacement for `fetch` that lets you call `.json()`, `.text()`, `.arrayBuffer()`, and `.blob()` multiple times on the same response — no manual `.clone()` needed.

The body is read once into a cache on the first call; all subsequent calls decode from that cache.

## Requirements

Node.js >= 18

## Installation

```bash
npm install fetchext
```

## Usage

### Basic drop-in replacement

```js
const fetchExt = require('fetchext');

const res = await fetchExt('https://api.example.com/data');
const data = await res.json();
```

### Read the body multiple times

With the native `fetch`, calling `.json()` or `.text()` twice throws because the body stream is consumed. `fetchExt` removes that limitation:

```js
const res = await fetchExt('https://api.example.com/data');

const obj  = await res.json(); // first read — fetches and caches the body
const text = await res.text(); // second read — decoded from cache, no extra request
const obj2 = await res.json(); // still works
```

### Mix body formats freely

```js
const res = await fetchExt('https://api.example.com/data');

const text   = await res.text();        // raw string
const parsed = await res.json();        // parsed object — same bytes, no re-fetch
const buf    = await res.arrayBuffer(); // raw bytes (defensive copy each call)
const blob   = await res.blob();        // Blob with correct content-type
```

### Parallel reads share a single underlying read

```js
const res = await fetchExt('https://api.example.com/data');

// All three share one network read — safe to call concurrently
const [a, b, c] = await Promise.all([res.text(), res.text(), res.text()]);
```

### Wrap a response you already have

If you already have a `Response` object (e.g. from middleware or a test helper), use `fetchExt.wrapResponse` directly:

```js
const fetchExt = require('fetchext');

const rawResponse = await fetch('https://api.example.com/data');
const res = fetchExt.wrapResponse(rawResponse);

await res.json();
await res.json(); // works fine
```

### All standard Response properties pass through

`fetchExt` returns a `Proxy` over the real `Response`, so all standard properties work as expected:

```js
const res = await fetchExt('https://api.example.com/data');

console.log(res.status);        // e.g. 200
console.log(res.ok);            // true / false
console.log(res.headers.get('content-type'));
```

### clone() produces an independent re-readable response

```js
const res    = await fetchExt('https://api.example.com/data');
const cloned = res.clone();

await res.text();    // reads original
await cloned.text(); // reads clone — independent cache
await res.text();    // still readable
```

## API

### `fetchExt(input, init?)`

Same signature as the native [`fetch`](https://developer.mozilla.org/en-US/docs/Web/API/fetch). Returns a `Promise` that resolves to a wrapped `Response`.

### `fetchExt.wrapResponse(response)`

Wraps an existing `Response` instance. Useful when you receive a `Response` from somewhere else and want re-readable body methods on it.

## Running tests

```bash
npm test
```

## License

ISC
