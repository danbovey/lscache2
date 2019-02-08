import LSCacheBucket from '../bucket';

const mockStore = {
  get: key => window.localStorage.getItem(key),
  set: (key, value) => window.localStorage.setItem(key, value),
  remove: key => window.localStorage.removeItem(key),
  key: i => window.localStorage.key(i),
  get length() {
    return window.localStorage.length;
  }
};

describe('LSCacheBucket', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('should construct a bucket', () => {
    const store = { get: () => {} };
    const bucket = new LSCacheBucket(store, {}, '');

    expect(bucket.store).toEqual(store);
  });

  it('should build the storage key', () => {
    const cachePrefix = 'prefix-';
    const bucket = new LSCacheBucket(null, { cachePrefix }, '');

    const key = bucket.buildKey('key');

    expect(key).toEqual(`${cachePrefix}/key`);
  });

  it('should build the storage key for a bucket', () => {
    const cachePrefix = 'prefix-';
    const bucketName = 'my-bucket';
    const bucket = new LSCacheBucket(null, { cachePrefix }, bucketName);

    const key = bucket.buildKey('key');

    expect(key).toEqual(`${cachePrefix}${bucketName}/key`);
  });

  it('should build the expiration key', () => {
    const cacheExpirationSuffix = '-expirationSuffix';
    const bucket = new LSCacheBucket(null, { cacheExpirationSuffix }, '');
    const key = 'key';

    const exprKey = bucket.buildExpirationKey(key);

    expect(exprKey).toEqual(`${key}${cacheExpirationSuffix}`);
  });

  it('can set and get a string value in localStorage', () => {
    const key = 'my-key';
    const value = 'my-value';
    const bucket = new LSCacheBucket(mockStore, { cachePrefix: '' }, '');

    bucket.set(key, value);
    const actualValue = bucket.get(key);

    expect(actualValue).toEqual(value);
  });

  it('can set and get non-string values in localStorage', () => {
    const bucket = new LSCacheBucket(mockStore, { cachePrefix: '' }, '');

    const numberKey = 'numberkey';
    const numberValue = 2;
    bucket.set(numberKey, numberValue);
    expect(bucket.get(numberKey) + 1).toEqual(numberValue + 1);

    const numberStringKey = 'numberstring';
    const numberStringValue = '2';
    bucket.set(numberStringKey, numberStringValue);
    expect(bucket.get(numberStringKey)).toEqual(numberStringValue);

    const arrayKey = 'arraykey';
    const arrayValue = ['a', 'b', 'c'];
    bucket.set(arrayKey, arrayValue);
    expect(bucket.get(arrayKey)).toEqual(arrayValue);

    const objectKey = 'objectkey';
    const objectValue = { name: 'Pamela', age: 26 };
    bucket.set(objectKey, objectValue);

    expect(bucket.get(objectKey)).toEqual(objectValue);
  });

  it('should not handle storing objects with circular references', () => {
    const key = 'objectkey';
    const value = { name: 'Circular', type: 'reference' };
    value.itself = value;
    const bucket = new LSCacheBucket(mockStore, { cachePrefix: '' }, '');

    const result = bucket.set(key, value);

    // We expect the value cannot be stored
    expect(result).toBe(false);
    // We expect value was not stored
    expect(bucket.get(key)).toBe(null);
  });

  it('can set and get with expiration and different units', done => {
    const key = 'thekey';
    const value = 'thevalue';
    const oldExpiryMilliseconds = 1000 * 60;
    let expiryMilliseconds = oldExpiryMilliseconds;
    const bucket = new LSCacheBucket(
      mockStore,
      { getExpiryMilliseconds: () => expiryMilliseconds, cachePrefix: '' },
      ''
    );

    expiryMilliseconds = 1000;
    const numExpiryUnits = 1;
    bucket.set(key, value, numExpiryUnits);
    // We expect value to be available pre-expiration
    expect(bucket.get(key)).toEqual(value);

    window.setTimeout(() => {
      expect(bucket.get(key)).toBe(null);
      done();
    }, expiryMilliseconds * numExpiryUnits);
  });

  it('can remove an item from localStorage', () => {
    const key = 'my-key';
    const value = 'my-value';
    const bucket = new LSCacheBucket(mockStore, { cachePrefix: '' }, '');

    bucket.set(key, value);
    bucket.remove(key);

    expect(bucket.get(key)).toBe(null);
  });

  it('can remove all items from localStorage', () => {
    const outsideValue = 'not part of lscache';
    window.localStorage.setItem('outside-cache', outsideValue);

    const bucket = new LSCacheBucket(mockStore, { cachePrefix: '' }, '');
    bucket.set('1', '1');
    bucket.set('2', '2');

    bucket.flush();

    expect(bucket.get('1')).toBe(null);
    // We expect localStorage value to still persist
    expect(window.localStorage.getItem('outside-cache')).toEqual(outsideValue);
  });

  it('can remove all items in a bucket from localStorage', () => {
    const globalBucket = new LSCacheBucket(mockStore, { cachePrefix: '' }, '');
    const bucketName = 'my-bucket';
    const bucket = new LSCacheBucket(
      mockStore,
      { cachePrefix: '' },
      bucketName
    );
    globalBucket.set('global', '1');
    bucket.set('my-key', 'my-value');

    bucket.flush();

    expect(globalBucket.get('global')).toEqual('1');
    expect(bucket.get('my-key')).toBe(null);
  });

  it('should flush old items when exceeding the storage quota', () => {
    const key = 'thekey';
    const bucket = new LSCacheBucket(
      mockStore,
      {
        cachePrefix: '',
        warn: () => {},
        getExpiryMilliseconds: () => 1000 * 60,
        getMaxDate: () => Math.floor(8.64e15 / (1000 * 60))
      },
      ''
    );

    const stringLength = 10000;
    const longString = new Array(stringLength + 1).join('s');
    let maxStorageQuota = 0;
    while (maxStorageQuota < 10000) {
      try {
        window.localStorage.setItem(key + maxStorageQuota, longString);
        maxStorageQuota++;
      } catch (e) {
        break;
      }
    }
    window.localStorage.clear();

    // Now add enough to go over the limit
    const approxLimit = maxStorageQuota * stringLength;
    const numKeys = Math.ceil(approxLimit / (stringLength + 8)) + 1;
    let currentKey;

    let i;
    for (i = 0; i <= numKeys; i++) {
      currentKey = key + i;
      // We expect new value to be added successfully
      expect(bucket.set(currentKey, longString, i + 1)).toBe(true);
    }
    // Test that newest value (last to expire) is still there
    expect(bucket.get(currentKey)).toEqual(longString);
    // Test that the first-to-expire is kicked out
    expect(bucket.get(key + '0')).toEqual(null);

    // Test trying to add something thats bigger than previous items,
    // check that it is successfully added (requires removal of multiple keys)
    var veryLongString = longString + longString;
    // We expect new value to be added successfully
    expect(bucket.set(key + 'long', veryLongString, i + 1)).toBe(true);
    // We expect long string to get stored
    expect(bucket.get(key + 'long')).toEqual(veryLongString);

    // Try the same with no expiry times
    window.localStorage.clear();
    for (let k = 0; k <= numKeys; k++) {
      currentKey = key + k;
      // We expect each value to be added successfully
      expect(bucket.set(currentKey, longString)).toBe(true);
    }
    // Test that latest added is still there
    expect(bucket.get(currentKey)).toEqual(longString);
  });

  it('should not store anything if a single item exceeds the storage quota', () => {
    const key = 'thekey';
    const bucket = new LSCacheBucket(
      mockStore,
      {
        cachePrefix: '',
        warn: () => {},
        getMaxDate: () => Math.floor(8.64e15 / (1000 * 60))
      },
      ''
    );

    const stringLength = 10000;
    const longString = new Array(stringLength + 1).join('s');
    let maxStorageQuota = 0;
    while (maxStorageQuota < 10000) {
      try {
        window.localStorage.setItem(key + maxStorageQuota, longString);
        maxStorageQuota++;
      } catch (e) {
        break;
      }
    }
    window.localStorage.clear();
    // Now make string long enough to go over limit
    var veryLongString = new Array(maxStorageQuota + 3).join(longString);

    const res = bucket.set(key + 'long', veryLongString);

    expect(res).toBe(false);
    // We expect nothing to be stored
    expect(bucket.get(key + 'long')).toBe(null);
  });
});
