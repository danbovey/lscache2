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
import LSCacheBucket from './bucket';
import { supportsStorage } from './supports';
import { calculateMaxDate } from './utils';

// Whether to display warnings
let warnings = false;
// Time resolution in milliseconds
let expiryMilliseconds = 60 * 1000;
// ECMAScript max Date (epoch + 1e8 days)
let maxDate = calculateMaxDate(expiryMilliseconds);

// Wrapper around localStorage
const store = {
  get: key => window.localStorage.getItem(key),
  set: (key, value) => {
    // Fix for iPad issue - sometimes throws QUOTA_EXCEEDED_ERR on setItem.
    window.localStorage.removeItem(key);
    window.localStorage.setItem(key, value);
  },
  remove: key => window.localStorage.removeItem(key),
  key: i => window.localStorage.key(i),
  get length() {
    return window.localStorage.length;
  }
};

const lscache = {
  globalBucket: {},
  buckets: {},

  // Prefix for all lscache keys
  cachePrefix: 'lscache-',
  // Suffix for the key name on the expiration items in localStorage
  cacheExpirationSuffix: '-expires_at',

  // Expose the global bucket as top level API
  get: key => lscache.globalBucket.get(key),
  set: (key, value, expiration) =>
    lscache.globalBucket.set(key, value, expiration),
  remove: key => lscache.globalBucket.remove(key),
  flush: () => lscache.globalBucket.flush(),
  flushExpired: () => lscache.globalBucket.flushExpired(),

  /**
   * Get an existing bucket or create and register one if necessary.
   *
   * @param {string} bucketName Bucket name
   */
  bucket: bucketName => {
    if (lscache.buckets[bucketName]) {
      return lscache.buckets[bucketName];
    }

    const bucket = new LSCacheBucket(store, lscache, bucketName);
    lscache.buckets[bucketName] = bucket;

    return bucket;
  },

  /**
   * @returns {number} The currently set number of milliseconds each time unit represents in
   *   the set() function's "time" argument.
   */
  getExpiryMilliseconds: () => expiryMilliseconds,

  /**
   * @returns {number} The currently set number of milliseconds each time unit represents in
   *   the set() function's "time" argument.
   */
  getMaxDate: () => maxDate,

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
  setExpiryMilliseconds: milliseconds => {
    expiryMilliseconds = milliseconds;
    maxDate = calculateMaxDate(expiryMilliseconds);
  },

  /**
   * Returns whether localStorage is supported.
   *
   * @return {boolean}
   */
  supported: () => supportsStorage(store),

  /**
   * Sets whether to display warnings when an item is removed from the cache or not.
   */
  enableWarnings: enabled => {
    warnings = enabled;
  },

  warn: (message, err) => {
    if (!warnings) return;
    if (!('console' in window) || typeof window.console.warn !== 'function')
      return;
    window.console.warn('lscache - ' + message);
    if (err) window.console.warn('lscache - The error was: ' + err.message);
  }
};

// Create the "global" bucket.
lscache.globalBucket = new LSCacheBucket(store, lscache, '');

export default lscache;
