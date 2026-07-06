'use strict';

const crypto = require('crypto');

/** URL-safe random token used for the "manage your booking" links in emails. */
function generateManageToken() {
  return crypto.randomBytes(24).toString('base64url');
}

module.exports = { generateManageToken };
