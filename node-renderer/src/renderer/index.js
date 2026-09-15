'use strict';
// Renderer factory. Swapping the render target (local ↔ VPS/Lambda) is a
// one-line config change (RENDER_TARGET), per the feasibility fallback plan.
const { config } = require('../config');
const { LocalRenderer } = require('./local');
const { ExternalRenderer } = require('./external');

let instance;

function getRenderer() {
  if (instance) return instance;
  if (config.renderTarget === 'external') {
    instance = new ExternalRenderer();
  } else {
    instance = new LocalRenderer();
  }
  return instance;
}

module.exports = { getRenderer };
