// Simple in-memory TTL cache for ultra-fast repeated requests

class MemoryCache {
  constructor(defaultTtlMs = 1000 * 60 * 30, maxItems = 500) {
    this.cache = new Map();
    this.defaultTtlMs = defaultTtlMs;
    this.maxItems = maxItems;
  }

  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;

    if (Date.now() > item.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return item.value;
  }

  set(key, value, ttlMs = this.defaultTtlMs) {
    // Evict oldest if reaching capacity
    if (this.cache.size >= this.maxItems) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }

    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttlMs
    });
  }

  has(key) {
    return this.get(key) !== null;
  }

  delete(key) {
    this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
  }
}

export const cache = new MemoryCache();
