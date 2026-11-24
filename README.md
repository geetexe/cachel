# cachel

Offline-first asset caching for the browser, powered by IndexedDB.

Fetch remote assets once, serve them forever from local cache. Works with any framework or none at all.

![npm](https://img.shields.io/npm/v/cachel)
![bundle size](https://img.shields.io/badge/gzip-2.83kB-brightgreen)
![license](https://img.shields.io/npm/l/cachel)

---

## Features

- Fetch and cache remote assets in IndexedDB with one call
- Batch cache multiple assets with controlled concurrency via `loadMany`
- Serve cached assets as object URLs, works fully offline
- Skips network requests for already cached assets
- Attach custom metadata to any cached asset
- Store blobs you already have (generated, decrypted, imported) under any key with `set`
- Atomic, ordered multi-step writes with `batch`: all or nothing
- Read everything in one transaction with `entries`, or raw blobs with `getBlob`
- Fetch failures carry a `code` (`fetch-failed`, `http-error`, `unsupported-type`)
- Observable cache via `onChange`, react to any mutation
- Singleton per database name
- Supports images, videos, audio and fonts
- Failed assets in batch processing are bypassed, successful ones are always cached
- No service worker required
- Zero dependencies

---

## Install

```bash
npm install cachel
```

---

## Usage

```javascript
import Cachel from 'cachel';

const cache = new Cachel('my-app');

// fetch and cache a remote asset
await cache.load('https://example.com/logo.png');

// retrieve cached asset
const { path, meta } = await cache.get('https://example.com/logo.png');
img.src = path; // works offline
```

---

## API

### `new Cachel(name?)`

Creates a new cachel instance. `name` is used as the IndexedDB database name, prefixed internally as `cachel:<name>`.

Multiple calls with the same name return the same instance, no duplicate IndexedDB connections.

```javascript
const cache = new Cachel('my-app'); // opens "cachel:my-app" in IndexedDB
```

Defaults to `'idb'` if no name is provided.

---

### `cache.load(url, options?)`

Fetches a remote asset and stores it in IndexedDB as a blob. If the asset is already cached, the network request is skipped.

```javascript
await cache.load('https://example.com/hero.jpg');

// with optional metadata
await cache.load('https://example.com/hero.jpg', { meta: { category: 'nature', tags: ['landscape'] } });
```

Supported content types: `image/*`, `video/*`, `audio/*`, `font/*`

Throws if the resource cannot be fetched or the content type is not supported.

| Option | Type | Default | Description |
|---|---|---|---|
| `meta` | `object` | `null` | Any metadata to associate with the cached asset |
| `silent` | `boolean` | `false` | Suppress `onChange` notifications |

The thrown error says why it failed through `error.code`, with the underlying error in `error.cause`:

| `error.code` | Meaning | Extra fields |
|---|---|---|
| `'fetch-failed'` | Network error, CORS block, invalid URL | |
| `'http-error'` | The server answered with a non-2xx status | `error.status` |
| `'unsupported-type'` | `content-type` missing or not a supported media type | `error.contentType` |

```javascript
import Cachel, { FETCH_ERROR_CODES } from 'cachel';

try {
    await cache.load(url);
} catch (err) {
    if (err.code === FETCH_ERROR_CODES.HTTP_ERROR && err.status === 404) {
        // the asset no longer exists
    }
}
```

---

### `cache.loadMany(urls, chunkSize?)`

Fetches and caches multiple assets in controlled parallel chunks. Returns a status object with results, success count, failed count, and time elapsed in milliseconds.

```javascript
const status = await cache.loadMany([
    'https://example.com/logo.png',
    'https://example.com/hero.jpg',
    'https://example.com/font.woff2'
]);

console.log(status);
// {
//   results: [...],  // raw Promise.allSettled results
//   success: 2,
//   failed: 1,
//   timeElapsed: 1240  // in milliseconds
// }
```

`chunkSize` controls how many assets are fetched in parallel per round. Defaults to `8`, clamped to a maximum of `8`. Assets already cached are skipped automatically.

```javascript
await cache.loadMany(urls, 4); // 4 parallel fetches per round
```

---

### `cache.get(url)`

Retrieves a cached asset. Returns `null` if not found.

```javascript
const record = await cache.get('https://example.com/hero.jpg');
if (record) {
    img.src = record.path;       // object URL, ready to use
    console.log(record.meta);    // metadata attached on load
    console.log(record.url);     // original URL
    console.log(record.size);    // size in bytes
    console.log(record.type);    // MIME type, e.g. 'image/jpeg'
}
```

Every call creates a new object URL. Call `URL.revokeObjectURL(record.path)` once you no longer need it, or use `getBlob()` to manage URLs yourself.

---

### `cache.getBlob(key)`

Like `get()`, but returns the `Blob` itself and creates no object URL. Returns `null` if not found. Useful for processing the bytes (hashing, encrypting, zipping, uploading) and in service workers, where `URL.createObjectURL` is unavailable.

```javascript
const record = await cache.getBlob('https://example.com/hero.jpg');
// { url, meta, blob, size, type }
const bytes = await record.blob.arrayBuffer();
```

---

### `cache.has(key)`

Returns `true` if the key is cached, without reading the blob.

```javascript
if (!(await cache.has(url))) showSaveButton();
```

---

### `cache.set(key, blob, options?)`

Stores a `Blob` you already have, without fetching anything. The key can be any non-empty string, not only a URL. Unlike `load()`, it **overwrites** an existing entry with the same key. Returns the key.

```javascript
// a generated or transformed asset
const thumb = await createThumbnail(original);
await cache.set('thumb:hero', thumb, { meta: { width: 320 } });

// restoring an exported backup without hitting the network
await cache.set(entry.url, entry.blob, { meta: entry.meta });
```

| Option | Type | Default | Description |
|---|---|---|---|
| `meta` | `object` | `null` | Any metadata to associate with the entry |
| `silent` | `boolean` | `false` | Suppress `onChange` notifications |

Throws a `TypeError` if `blob` is not a `Blob`.

---

### `cache.entries(options?)`

Returns every cached entry in a single IndexedDB transaction, without creating object URLs. Much faster than `keys()` followed by `get()` for each key.

```javascript
const all = await cache.entries();
// [{ url, meta, size, type }, ...]

const totalBytes = all.reduce((sum, entry) => sum + entry.size, 0);

// include the blobs, e.g. to export everything
const withBlobs = await cache.entries({ blobs: true });
// [{ url, meta, size, type, blob }, ...]
```

| Option | Type | Default | Description |
|---|---|---|---|
| `blobs` | `boolean` | `false` | Include each entry's `Blob` |

---

### `cache.batch(operations, options?)`

Applies several writes **atomically and in order** in one transaction: either all of them are saved or none are. Use it whenever a crash between two writes would leave the cache inconsistent, for example replacing an entry under a new key.

```javascript
// move an asset to a new key in one step
const { blob, meta } = await cache.getBlob(oldKey);
await cache.batch([
    { op: 'set', key: newKey, blob, meta },
    { op: 'remove', key: oldKey },
]);

// tag many entries at once
await cache.batch(keys.map(key => ({ op: 'update', key, meta: { album: 'trip' } })));
```

| Operation | Fields | Effect |
|---|---|---|
| `set` | `key`, `blob`, `meta?` | Store a `Blob` (overwrites) |
| `update` | `key`, `meta` | Merge `meta` into an existing entry. Fails the batch if the key is not cached |
| `remove` | `key` | Delete an entry (no error if missing) |

Resolves with the number of operations applied, or `null` if the batch failed and nothing was written. Throws a `TypeError` for malformed operations before touching the database. Fires `onChange` once per batch unless `{ silent: true }` is passed.

---

### `cache.updateRecord(url, meta)`

Updates the metadata of an already cached asset without re-fetching the blob. Merges with existing metadata.

```javascript
await cache.updateRecord('https://example.com/hero.jpg', { category: 'updated' });
```

---

### `cache.onChange(callback)`

Registers a listener that fires whenever the cache is mutated. Returns an unsubscribe function.

```javascript
const unsubscribe = cache.onChange(({ version, timestamp }) => {
    console.log(`cache updated, version ${version} at ${timestamp}`);
});

// cleanup
unsubscribe();
```

Fires on: `load`, `loadMany`, `set`, `batch`, `remove`, `clear`, `updateRecord`.

---

### `cache.checkStorage()`

Returns storage usage information for the current origin.

```javascript
const info = await cache.checkStorage();
console.log(info);
// {
//   quota: 123456789,       // total available bytes
//   usage: 12345,           // total used bytes across all storage types
//   free: 123444444,        // available bytes
//   percentUsed: 0.01,      // percentage used
//   percentFree: 99.99,     // percentage free
//   indexedDBUsage: 8192    // bytes used by IndexedDB specifically (Chrome only)
// }
```

Note: `indexedDBUsage` is Chrome-only via the non-standard `usageDetails` API. Returns `0` in other browsers.

---

### `cache.remove(url)`

Removes a single cached asset.

```javascript
await cache.remove('https://example.com/hero.jpg');
```

---

### `cache.keys()`

Returns an array of all cached URLs.

```javascript
const cached = await cache.keys();
console.log(cached); // ['https://example.com/logo.png', ...]
```

---

### `cache.clear()`

Removes all cached assets from the store but keeps the database intact.

```javascript
await cache.clear();
```

---

### `cache.delete()`

Drops the entire IndexedDB database.

```javascript
await cache.delete();
```

---

## Framework Usage

### Angular

```typescript
@Directive({ selector: '[cachel]' })
export class CachelDirective implements OnInit, OnDestroy {
  @Input() cachel: string;
  private path: string;
  private cache = new Cachel('my-app');

  async ngOnInit() {
    await this.cache.load(this.cachel);
    const record = await this.cache.get(this.cachel);
    if (record) this.el.nativeElement.src = record.path;
    this.path = record?.path;
  }

  ngOnDestroy() {
    if (this.path) URL.revokeObjectURL(this.path);
  }

  constructor(private el: ElementRef) {}
}
```

```html
<img cachel="https://example.com/logo.png" />
```

### React

```javascript
const cache = new Cachel('my-app');

export function useCachedAsset(url) {
  const [record, setRecord] = useState(null);

  useEffect(() => {
    cache.load(url).then(() => cache.get(url)).then(setRecord);
    return () => { if (record?.path) URL.revokeObjectURL(record.path); };
  }, [url]);

  return record;
}

// usage
const record = useCachedAsset('https://example.com/logo.png');
<img src={record?.path} />
```

---

## Browser Compatibility

cachel uses IndexedDB which is supported in all modern browsers since 2015.

| Browser | Support |
|---|---|
| Chrome | 23+ |
| Firefox | 10+ |
| Safari | 10+ |
| Edge | 79+ |
| iOS Safari | 10+ |

No service worker required. Works in any browser context, including service workers and web workers. In workers, use `getBlob()` or `entries()` instead of `get()`, since `URL.createObjectURL` is not available there.

---

## License

MIT