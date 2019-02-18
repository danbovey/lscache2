import { supportsJSON, supportsStorage } from './supports';
import { escapeRegExpSpecialCharacters, isOutOfSpace } from './utils';

class LSCacheBucket {
  /**
   * Create a new lscache bucket
   *
   * @param {Object} store Store wrapper
   * @param {lscache} lscache Instance of lscache (yay circular references!)
   * @param {String} bucketName Bucket name
   */
  constructor(store, lscache, bucketName) {
    this.store = store;
    this.lscache = lscache;
    this.bucketName = bucketName;

    // expiration date radix (set to Base-36 for most space savings)
    this.expiryRadix = 10;
  }

  buildKey = key => {
    const bucketPrefix = this.bucketName ? `${this.bucketName}/` : '';

    return `${this.lscache.cachePrefix}${bucketPrefix}${key}`;
  };

  buildExpirationKey = key =>
    `${this.lscache.cachePrefix}${bucketPrefix}${key}${
      this.lscache.cacheExpirationSuffix
    }`;

  /**
   * Retrieves specified value from localStorage, if not expired.
   *
   * @param {string} key
   * @return {string|Object}
   */
  get = key => {
    if (!supportsStorage(this.store)) return null;

    // Return the de-serialized item if not expired
    if (this._flushExpiredItem(key)) {
      return null;
    }

    // Tries to de-serialize stored value if its an object, and returns the normal value otherwise.
    const value = this.store.get(this.buildKey(key));
    if (!value || !supportsJSON()) {
      return value;
    }

    try {
      // We can't tell if its JSON or a string, so we try to parse
      return JSON.parse(value);
    } catch (err) {
      // If we can't parse, it's probably because it isn't an object
      return value;
    }
  };

  /**
   * Stores the value in localStorage. Expires after specified number of minutes.
   *
   * @param {string} key
   * @param {Object|string} value
   * @param {number} time
   * @return true if the value was inserted successfully
   */
  set = (key, value, time) => {
    if (!supportsStorage(this.store)) return false;

    // If we don't get a string value, try to stringify
    // In future, localStorage may properly support storing non-strings
    // and this can be removed.

    if (!supportsJSON()) return false;
    try {
      value = JSON.stringify(value);
    } catch (e) {
      // Sometimes we can't stringify due to circular refs
      // in complex objects, so we won't bother storing then.
      return false;
    }

    try {
      this.store.set(this.buildKey(key), value);
    } catch (err) {
      if (isOutOfSpace(err)) {
        // If we exceeded the quota, then we will sort
        // by the expire time, and then remove the N oldest
        const storedKeys = [];
        this._eachKey((key, exprKey) => {
          var expiration = this.store.get(exprKey);
          if (expiration) {
            expiration = parseInt(expiration, this.expiryRadix);
          } else {
            // TODO: Store date added for non-expiring items for smarter removal
            expiration = this.lscache.getMaxDate();
          }
          storedKeys.push({
            key,
            size: (this.store.get(this.buildKey(key)) || '').length,
            expiration
          });
        });
        // Sorts the keys with oldest expiration time last
        storedKeys.sort((a, b) => b.expiration - a.expiration);

        let targetSize = (value || '').length;
        let storedKey;
        while (storedKeys.length && targetSize > 0) {
          storedKey = storedKeys.pop();
          this.lscache.warn(
            "Cache is full, removing item with key '" + key + "'"
          );
          this._flushItem(storedKey.key);
          targetSize -= storedKey.size;
        }
        try {
          this.store.set(this.buildKey(key), value);
        } catch (setErr) {
          // value may be larger than total quota
          this.lscache.warn(
            "Could not add item with key '" + key + "', perhaps it's too big?",
            setErr
          );
          return false;
        }
      } else {
        console.log(err);
        // If it was some other error, just give up.
        this.lscache.warn("Could not add item with key '" + key + "'", err);
        return false;
      }
    }

    // If a time is specified, store expiration info in localStorage
    if (time) {
      this.store.set(
        this.buildExpirationKey(key),
        (this._currentTime() + time).toString(this.expiryRadix)
      );
    } else {
      // In case they previously set a time, remove that info from localStorage.
      this.store.remove(this.buildExpirationKey(key));
    }
    return true;
  };

  /**
   * Removes a value from localStorage.
   *
   * @param {string} key
   */
  remove = key => {
    if (!supportsStorage(this.store)) return;

    this._flushItem(key);
  };

  /**
   * Flushes all lscache items and expiry markers without affecting rest of localStorage
   */
  flush = () => {
    if (!supportsStorage(this.store)) return;

    this._eachKey(key => this._flushItem(key));
  };

  /**
   * Flushes expired lscache items and expiry markers without affecting rest of localStorage
   */
  flushExpired = () => {
    if (!supportsStorage(this.store)) return;

    this._eachKey(key => _flushExpiredItem(key));
  };

  _eachKey = fn => {
    const escapedBucketName = escapeRegExpSpecialCharacters(this.bucketName);
    const prefixRegExp = new RegExp(
      `^${this.lscache.cachePrefix}${escapedBucketName}\/(.*)`
    );
    // Loop in reverse as removing items will change indices of tail
    for (let i = this.store.length - 1; i >= 0; --i) {
      let key = this.store.key(i);
      key = key && key.match(prefixRegExp);
      key = key && key[1];
      if (key && key.indexOf(this.lscache.cacheExpirationSuffix) < 0) {
        fn(key, this.buildExpirationKey(key));
      }
    }
  };

  _flushItem = key => {
    this.store.remove(this.buildKey(key));
    this.store.remove(this.buildExpirationKey(key));
  };

  _flushExpiredItem = key => {
    const expr = this.store.get(this.buildExpirationKey(key));

    if (expr) {
      const expirationTime = parseInt(expr, this.expiryRadix);

      // Check if we should actually kick item out of storage
      if (this._currentTime() >= expirationTime) {
        this._flushItem(key);

        return true;
      }
    }

    return false;
  };

  /**
   * Returns the number of minutes since the epoch.
   *
   * @return {Number}
   */
  _currentTime = () =>
    Math.floor(new Date().getTime() / this.lscache.getExpiryMilliseconds());
}

export default LSCacheBucket;
