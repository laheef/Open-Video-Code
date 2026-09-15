'use strict';
const { config } = require('./config');

function ts() { return new Date().toISOString(); }

const log = {
  info: (...a) => console.log(`[${ts()}] [info]`, ...a),
  warn: (...a) => console.warn(`[${ts()}] [warn]`, ...a),
  error: (...a) => console.error(`[${ts()}] [error]`, ...a),
  debug: (...a) => { if (config.verbose) console.log(`[${ts()}] [debug]`, ...a); },
};

module.exports = { log };
