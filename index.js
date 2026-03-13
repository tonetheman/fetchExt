'use strict';

/**
 * Wraps a fetch Response so that body-consuming methods (.json, .text,
 * .arrayBuffer, .blob) can be called multiple times without cloning.
 * The raw bytes are cached on the first read; subsequent calls decode
 * from that cache.
 */
function wrapResponse(response) {
  let cache = null; // ArrayBuffer, populated on first body read
  let pending = null; // in-flight promise so parallel calls share one read

  const getBuffer = () => {
    if (cache !== null) return Promise.resolve(cache);
    if (pending !== null) return pending;
    pending = response.arrayBuffer().then((buf) => {
      cache = buf;
      pending = null;
      return buf;
    });
    return pending;
  };

  const decode = (buf) => new TextDecoder().decode(buf);

  return new Proxy(response, {
    get(target, prop) {
      switch (prop) {
        case 'text':
          return () => getBuffer().then(decode);

        case 'json':
          return () => getBuffer().then((buf) => JSON.parse(decode(buf)));

        case 'arrayBuffer':
          return () => getBuffer().then((buf) => buf.slice(0)); // defensive copy

        case 'blob':
          return () =>
            getBuffer().then(
              (buf) => new Blob([buf], { type: target.headers.get('content-type') || '' })
            );

        case 'clone':
          return () => wrapResponse(target.clone());

        case 'bodyUsed':
          // Once the cache is populated we've consumed the underlying body,
          // but from the caller's perspective the body is always "re-readable".
          return false;

        default: {
          const value = target[prop];
          return typeof value === 'function' ? value.bind(target) : value;
        }
      }
    },
  });
}

/**
 * Drop-in replacement for fetch that returns a re-readable response.
 *
 * @param {RequestInfo | URL} input
 * @param {RequestInit} [init]
 * @returns {Promise<Proxy<Response>>}
 */
async function fetchExt(input, init) {
  const response = await fetch(input, init);
  return wrapResponse(response);
}

// Also expose wrapResponse so callers can upgrade a Response they already have.
fetchExt.wrapResponse = wrapResponse;

module.exports = fetchExt;
