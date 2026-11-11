const Module = require('module');
const origRequire = Module.prototype.require;

Module.prototype.require = function(id) {
  const result = origRequire.apply(this, arguments);
  if (id.endsWith('/server/config') || id.endsWith('\\server\\config') || id === '../server/config') {
    const origDefault = result.default;
    return new Proxy(result, {
      get(target, prop) {
        if (prop === 'default') {
          return async function(...args) {
            const config = await origDefault.apply(this, args);
            config.experimental = config.experimental || {};
            config.experimental.webpackBuildWorker = false;
            config.cleanDistDir = false;
            return config;
          };
        }
        return target[prop];
      }
    });
  }
  return result;
};
