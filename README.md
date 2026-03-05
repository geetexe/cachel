# cachel

Offline-first asset caching for the browser, powered by IndexedDB.

Fetch remote assets once, serve them forever from local cache. Works with any framework or none at all.

![npm](https://img.shields.io/npm/v/cachel)
![license](https://img.shields.io/npm/l/cachel)

---

## Features

- Fetch and cache remote assets in IndexedDB with one call
- Batch cache multiple assets with controlled concurrency via `loadMany`
- Serve cached assets as object URLs, works fully offline
- Skips network requests for already cached assets
- Supports images, videos, audio and fonts
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

// retrieve cached asset as an object URL
const url = await cache.get('https://example.com/logo.png');
img.src = url; // works offline
```

---

## API

### `new Cachel(name?)`

Creates a new cachel instance. `name` is used as the IndexedDB database name, prefixed internally as `cachel:<name>`.

```javascript
const cache = new Cachel('my-app'); // opens "cachel:my-app" in IndexedDB
```

Defaults to `'idb'` if no name is provided.

---

### `cache.load(url)`

Fetches a remote asset and stores it in IndexedDB as a blob. If the asset is already cached, the network request is skipped.

```javascript
await cache.load('https://example.com/hero.jpg');
```

Supported content types: `image/*`, `video/*`, `audio/*`, `font/*`

Throws if the fetch fails or the content type is not supported.

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

`chunkSize` controls how many assets are fetched in parallel per round. Defaults to `8`, max is `8`. Assets already cached are skipped automatically.

```javascript
await cache.loadMany(urls, 4); // 4 parallel fetches per round
```

---

### `cache.get(url)`

Retrieves a cached asset and returns it as an object URL. Returns `null` if not found.

```javascript
const url = await cache.get('https://example.com/hero.jpg');
if (url) img.src = url;
```

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
  private objectUrl: string;
  private cache = new Cachel('my-app');

  async ngOnInit() {
    await this.cache.load(this.cachel);
    this.objectUrl = await this.cache.get(this.cachel);
    this.el.nativeElement.src = this.objectUrl;
  }

  ngOnDestroy() {
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
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
  const [src, setSrc] = useState(null);

  useEffect(() => {
    cache.load(url).then(() => cache.get(url)).then(setSrc);
    return () => { if (src) URL.revokeObjectURL(src); };
  }, [url]);

  return src;
}

// usage
const src = useCachedAsset('https://example.com/logo.png');
<img src={src} />
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