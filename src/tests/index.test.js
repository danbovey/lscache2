import lscache from '../index';

describe('lscache', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('can check if localStorage API is supported', () => {
    const ls = window.localStorage;
    const supported = lscache.supported();

    expect(supported).toBe(true);
  });

  it('should show warnings when enabled', () => {
    const warn = jest.fn();
    global.console = { warn };

    // Find the maximum storage quota of jsdom
    const longString = new Array(10000).join('s');
    let maxStorageQuota = 0;
    while (maxStorageQuota < 10000) {
      try {
        window.localStorage.setItem('key' + maxStorageQuota, longString);
        maxStorageQuota++;
      } catch (e) {
        break;
      }
    }
    window.localStorage.clear();

    let i;
    for (i = 0; i <= maxStorageQuota; i++) {
      lscache.set('key' + i, longString);
    }

    // Warnings not enabled, nothing should be logged
    expect(warn).not.toHaveBeenCalled();

    lscache.enableWarnings(true);

    lscache.set('key' + i, longString);

    // We expect one warning to have been printed
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
