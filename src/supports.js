import { isOutOfSpace } from './utils';

let cachedSupportsStorage = null;

/**
 * Determines if localStorage is supported in the browser;
 * result is cached for better performance instead of being run each time.
 * Feature detection is based on how Modernizr does it;
 * it's not straightforward due to FF4 issues.
 * It's not run at parse-time as it takes 200ms in Android.
 *
 * @param {Object} store
 */
export const supportsStorage = store => {
  const testValue = '__lscachetest__';

  if (cachedSupportsStorage !== null) {
    return cachedSupportsStorage;
  }

  // some browsers will throw an error if you try to access local storage (e.g. brave browser)
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
    console.error(e);
    // If we hit the limit, and we don't have an empty localStorage then it means we have support
    if (isOutOfSpace(e) && store.length) {
      cachedSupportsStorage = true; // just maxed it out and even the set test failed.
    } else {
      cachedSupportsStorage = false;
    }
  }

  return cachedSupportsStorage;
};

// Determines if native JSON (de-)serialization is supported in the browser.
export const supportsJSON = () => window.JSON != null;
