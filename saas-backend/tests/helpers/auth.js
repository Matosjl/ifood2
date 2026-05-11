const jwt = require('jsonwebtoken');

/**
 * Generates a signed JWT for use in test requests.
 *
 * Sets both `sub` (standard JWT subject) and `id` on the payload so the token
 * works with code that reads either req.user.userId (from `sub`) or req.user.id.
 *
 * @param {object} opts
 * @param {string} opts.userId
 * @param {string} opts.tenantId
 * @param {string} [opts.role='owner']
 * @returns {string} Bearer token value
 */
const makeToken = ({ userId, tenantId, role = 'owner' }) => {
  return jwt.sign(
    { sub: userId, tenantId, role },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
};

module.exports = { makeToken };
