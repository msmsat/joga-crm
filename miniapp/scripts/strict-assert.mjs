import assert from 'node:assert/strict';

// Older self-checks use console.assert, which normally logs and exits zero.
console.assert = (condition, ...message) => assert.ok(condition, message.join(' '));
