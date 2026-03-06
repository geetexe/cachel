# cachel

Offline-first asset caching for the browser, powered by IndexedDB.

Fetch remote assets once, serve them forever from local cache. Works with any framework or none at all.

![npm](https://img.shields.io/npm/v/cachel)
![bundle size](https://img.shields.io/badge/gzip-1.78kB-brightgreen)
![license](https://img.shields.io/npm/l/cachel)

---

## Features

- Fetch and cache remote assets in IndexedDB with one call
- Batch cache multiple assets with controlled concurrency via `loadMany`
- Serve cached assets as object URLs, works fully offline
- Skips network requests for already cached assets
- Attach custom metadata to any cached asset
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
}
```

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

Fires on: `load`, `loadMany`, `remove`, `clear`, `updateRecord`.

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

No service worker required. Works in any browser context.

---

## License

MIT