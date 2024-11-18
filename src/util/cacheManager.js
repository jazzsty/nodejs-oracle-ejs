// cacheManager.js
export class CacheManager {
    static instance = null;

    constructor() {
        if (!CacheManager.instance) {
            this.stationCache = new Map();
            CacheManager.instance = this;
        }
        return CacheManager.instance;
    }

    getCache() {
        return this.stationCache;
    }

    setCache(key, value) {
        this.stationCache.set(key, value);
    }

    clearCache() {
        this.stationCache.clear();
    }
}

export default CacheManager;
