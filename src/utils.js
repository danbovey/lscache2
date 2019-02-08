export const escapeRegExpSpecialCharacters = text =>
  text.replace(/[[\]{}()*+?.\\^$|]/g, '\\$&');

/**
 * ECMAScript max Date (epoch + 1e8 days)
 *
 * @param {Number} expiryMilliseconds
 */
export const calculateMaxDate = expiryMilliseconds =>
  Math.floor(8.64e15 / expiryMilliseconds);

/**
 * Check to set if the error is us dealing with being out of space
 *
 * @param {Error} err
 */
export const isOutOfSpace = err => {
  return (
    err &&
    (err.name === 'QUOTA_EXCEEDED_ERR' ||
      err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      err.name === 'QuotaExceededError')
  );
};
