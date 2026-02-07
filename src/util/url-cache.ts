import { LRUCache } from 'lru-cache';
import { URL } from 'url';

/**
 * LRU-cached URL parser to avoid repeated URL parsing overhead.
 */
class UrlCache {
  private cache: LRUCache<string, URL>;

  constructor(options: { max?: number; ttl?: number } = {}) {
    this.cache = new LRUCache<string, URL>({
      max: options.max || 500,
      ttl: options.ttl || 1000 * 60 * 10
    });
  }

  get(uri: string): URL {
    let parsed = this.cache.get(uri);
    if (!parsed) {
      parsed = new URL(uri);
      this.cache.set(uri, parsed);
    }
    return parsed;
  }

  getWithBase(url: string, base: string): URL {
    const key = `${base}|${url}`;
    let parsed = this.cache.get(key);
    if (!parsed) {
      parsed = new URL(url, base);
      this.cache.set(key, parsed);
    }
    return parsed;
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

export const urlCache = new UrlCache();
export { UrlCache };
