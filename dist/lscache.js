(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
  typeof define === 'function' && define.amd ? define(factory) :
  (global = global || self, global.lscache = factory());
}(this, function () { 'use strict';

  function _classCallCheck(instance, Constructor) {
    if (!(instance instanceof Constructor)) {
      throw new TypeError("Cannot call a class as a function");
    }
  }

  function _defineProperty(obj, key, value) {
    if (key in obj) {
      Object.defineProperty(obj, key, {
        value: value,
        enumerable: true,
        configurable: true,
        writable: true
      });
    } else {
      obj[key] = value;
    }

    return obj;
  }

  var escapeRegExpSpecialCharacters = function escapeRegExpSpecialCharacters(text) {
    return text.replace(/[[\]{}()*+?.\\^$|]/g, '\\$&');
  };
  /**
   * ECMAScript max Date (epoch + 1e8 days)
   *
   * @param {Number} expiryMilliseconds
   */

  var calculateMaxDate = function calculateMaxDate(expiryMilliseconds) {
    return Math.floor(8.64e15 / expiryMilliseconds);
  };
  /**
   * Check to set if the error is us dealing with being out of space
   *
   * @param {Error} err
   */

  var isOutOfSpace = function isOutOfSpace(err) {
    return err && (err.name === 'QUOTA_EXCEEDED_ERR' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED' || err.name === 'QuotaExceededError');
  };

  var cachedSupportsStorage = null;
  /**
   * Determines if localStorage is supported in the browser;
   * result is cached for better performance instead of being run each time.
   * Feature detection is based on how Modernizr does it;
   * it's not straightforward due to FF4 issues.
   * It's not run at parse-time as it takes 200ms in Android.
   *
   * @param {Object} store
   */

  var supportsStorage = function supportsStorage(store) {
    var testValue = '__lscachetest__';

    if (cachedSupportsStorage !== null) {
      return cachedSupportsStorage;
    } // some browsers will throw an error if you try to access local storage (e.g. brave browser)
    // hence check is inside a try/catch


    try {
      if (!window.localStorage) {
        return false;
      }
    } catch (ex) {
      return false;
    }

    try {
      store.set(testValue, testValue);
      store.remove(testValue);
      cachedSupportsStorage = true;
    } catch (e) {
      console.error(e); // If we hit the limit, and we don't have an empty localStorage then it means we have support

      if (isOutOfSpace(e) && store.length) {
        cachedSupportsStorage = true; // just maxed it out and even the set test failed.
      } else {
        cachedSupportsStorage = false;
      }
    }

    return cachedSupportsStorage;
  }; // Determines if native JSON (de-)serialization is supported in the browser.

  var supportsJSON = function supportsJSON() {
    return window.JSON != null;
  };

  var LSCacheBucket =
  /**
   * Create a new lscache bucket
   *
   * @param {Object} store Store wrapper
   * @param {lscache} lscache Instance of lscache (yay circular references!)
   * @param {String} bucketName Bucket name
   */
  function LSCacheBucket(store, lscache, bucketName) {
    var _this = this;

    _classCallCheck(this, LSCacheBucket);

    _defineProperty(this, "buildKey", function (key) {
      var bucketPrefix = _this.bucketName ? "".concat(_this.bucketName, "/") : '';
      return "".concat(_this.lscache.cachePrefix).concat(bucketPrefix).concat(key);
    });

    _defineProperty(this, "buildExpirationKey", function (key) {
      return "".concat(_this.lscache.cachePrefix).concat(key).concat(_this.lscache.cacheExpirationSuffix);
    });

    _defineProperty(this, "get", function (key) {
      if (!supportsStorage(_this.store)) return null; // Return the de-serialized item if not expired

      if (_this._flushExpiredItem(key)) {
        return null;
      } // Tries to de-serialize stored value if its an object, and returns the normal value otherwise.


      var value = _this.store.get(_this.buildKey(key));

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
    });

    _defineProperty(this, "set", function (key, value, time) {
      if (!supportsStorage(_this.store)) return false; // If we don't get a string value, try to stringify
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
        _this.store.set(_this.buildKey(key), value);
      } catch (err) {
        if (isOutOfSpace(err)) {
          // If we exceeded the quota, then we will sort
          // by the expire time, and then remove the N oldest
          var storedKeys = [];

          _this._eachKey(function (key, exprKey) {
            var expiration = _this.store.get(exprKey);

            if (expiration) {
              expiration = parseInt(expiration, _this.expiryRadix);
            } else {
              // TODO: Store date added for non-expiring items for smarter removal
              expiration = _this.lscache.getMaxDate();
            }

            storedKeys.push({
              key: key,
              size: (_this.store.get(_this.buildKey(key)) || '').length,
              expiration: expiration
            });
          }); // Sorts the keys with oldest expiration time last


          storedKeys.sort(function (a, b) {
            return b.expiration - a.expiration;
          });
          var targetSize = (value || '').length;
          var storedKey;

          while (storedKeys.length && targetSize > 0) {
            storedKey = storedKeys.pop();

            _this.lscache.warn("Cache is full, removing item with key '" + key + "'");

            _this._flushItem(storedKey.key);

            targetSize -= storedKey.size;
          }

          try {
            _this.store.set(_this.buildKey(key), value);
          } catch (setErr) {
            // value may be larger than total quota
            _this.lscache.warn("Could not add item with key '" + key + "', perhaps it's too big?", setErr);

            return false;
          }
        } else {
          console.log(err); // If it was some other error, just give up.

          _this.lscache.warn("Could not add item with key '" + key + "'", err);

          return false;
        }
      } // If a time is specified, store expiration info in localStorage


      if (time) {
        _this.store.set(_this.buildExpirationKey(key), (_this._currentTime() + time).toString(_this.expiryRadix));
      } else {
        // In case they previously set a time, remove that info from localStorage.
        _this.store.remove(_this.buildExpirationKey(key));
      }

      return true;
    });

    _defineProperty(this, "remove", function (key) {
      if (!supportsStorage(_this.store)) return;

      _this._flushItem(key);
    });

    _defineProperty(this, "flush", function () {
      if (!supportsStorage(_this.store)) return;

      _this._eachKey(function (key) {
        return _this._flushItem(key);
      });
    });

    _defineProperty(this, "flushExpired", function () {
      if (!supportsStorage(_this.store)) return;

      _this._eachKey(function (key) {
        return _flushExpiredItem(key);
      });
    });

    _defineProperty(this, "_eachKey", function (fn) {
      var escapedBucketName = escapeRegExpSpecialCharacters(_this.bucketName);
      var prefixRegExp = new RegExp("^".concat(_this.lscache.cachePrefix).concat(escapedBucketName, "/(.*)")); // Loop in reverse as removing items will change indices of tail

      for (var i = _this.store.length - 1; i >= 0; --i) {
        var key = _this.store.key(i);

        key = key && key.match(prefixRegExp);
        key = key && key[1];

        if (key && key.indexOf(_this.lscache.cacheExpirationSuffix) < 0) {
          fn(key, _this.buildExpirationKey(key));
        }
      }
    });

    _defineProperty(this, "_flushItem", function (key) {
      _this.store.remove(_this.buildKey(key));

      _this.store.remove(_this.buildExpirationKey(key));
    });

    _defineProperty(this, "_flushExpiredItem", function (key) {
      var expr = _this.store.get(_this.buildExpirationKey(key));

      if (expr) {
        var expirationTime = parseInt(expr, _this.expiryRadix); // Check if we should actually kick item out of storage

        if (_this._currentTime() >= expirationTime) {
          _this._flushItem(key);

          return true;
        }
      }

      return false;
    });

    _defineProperty(this, "_currentTime", function () {
      return Math.floor(new Date().getTime() / _this.lscache.getExpiryMilliseconds());
    });

    this.store = store;
    this.lscache = lscache;
    this.bucketName = bucketName; // expiration date radix (set to Base-36 for most space savings)

    this.expiryRadix = 10;
  };

  /**
   * lscache library
   * Copyright (c) 2011, Pamela Fox
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *       http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   */

  var warnings = false; // Time resolution in milliseconds

  var expiryMilliseconds = 60 * 1000; // ECMAScript max Date (epoch + 1e8 days)

  var maxDate = calculateMaxDate(expiryMilliseconds); // Wrapper around localStorage

  var store = {
    get: function get(key) {
      return window.localStorage.getItem(key);
    },
    set: function set(key, value) {
      // Fix for iPad issue - sometimes throws QUOTA_EXCEEDED_ERR on setItem.
      window.localStorage.removeItem(key);
      window.localStorage.setItem(key, value);
    },
    remove: function remove(key) {
      return window.localStorage.removeItem(key);
    },
    key: function key(i) {
      return window.localStorage.key(i);
    },

    get length() {
      return window.localStorage.length;
    }

  };
  var lscache = {
    globalBucket: {},
    buckets: {},
    // Prefix for all lscache keys
    cachePrefix: 'lscache-',
    // Suffix for the key name on the expiration items in localStorage
    cacheExpirationSuffix: '-expires_at',
    // Expose the global bucket as top level API
    get: function get(key) {
      return lscache.globalBucket.get(key);
    },
    set: function set(key, value, expiration) {
      return lscache.globalBucket.set(key, value, expiration);
    },
    remove: function remove(key) {
      return lscache.globalBucket.remove(key);
    },
    flush: function flush() {
      return lscache.globalBucket.flush();
    },
    flushExpired: function flushExpired() {
      return lscache.globalBucket.flushExpired();
    },

    /**
     * Get an existing bucket or create and register one if necessary.
     *
     * @param {string} bucketName Bucket name
     */
    bucket: function bucket(bucketName) {
      if (lscache.buckets[bucketName]) {
        return lscache.buckets[bucketName];
      }

      var bucket = new LSCacheBucket(store, lscache, bucketName);
      lscache.buckets[bucketName] = bucket;
      return bucket;
    },

    /**
     * @returns {number} The currently set number of milliseconds each time unit represents in
     *   the set() function's "time" argument.
     */
    getExpiryMilliseconds: function getExpiryMilliseconds() {
      return expiryMilliseconds;
    },

    /**
     * @returns {number} The currently set number of milliseconds each time unit represents in
     *   the set() function's "time" argument.
     */
    getMaxDate: function getMaxDate() {
      return maxDate;
    },

    /**
     * Sets the number of milliseconds the time argument in set() will represent.
     *
     * Sample values:
     *  1: each time unit = 1 millisecond
     *  1000: each time unit = 1 second
     *  60000: each time unit = 1 minute (Default value)
     *  360000: each time unit = 1 hour
     *
     * @param {number} milliseconds
     */
    setExpiryMilliseconds: function setExpiryMilliseconds(milliseconds) {
      expiryMilliseconds = milliseconds;
      maxDate = calculateMaxDate(expiryMilliseconds);
    },

    /**
     * Returns whether localStorage is supported.
     *
     * @return {boolean}
     */
    supported: function supported() {
      return supportsStorage(store);
    },

    /**
     * Sets whether to display warnings when an item is removed from the cache or not.
     */
    enableWarnings: function enableWarnings(enabled) {
      warnings = enabled;
    },
    warn: function warn(message, err) {
      if (!warnings) return;
      if (!('console' in window) || typeof window.console.warn !== 'function') return;
      window.console.warn('lscache - ' + message);
      if (err) window.console.warn('lscache - The error was: ' + err.message);
    }
  }; // Create the "global" bucket.

  lscache.globalBucket = new LSCacheBucket(store, lscache, '');

  return lscache;

}));
