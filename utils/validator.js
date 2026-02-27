/**
 * Validates if the provided string is a valid URL.
 * @param {string} url - The URL string to validate.
 * @returns {boolean} True if valid, false otherwise.
 */
function isValidUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch (err) {
    return false;
  }
}

module.exports = {
  isValidUrl
};
