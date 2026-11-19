const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Watch monorepo workspace packages
config.watchFolders = [monorepoRoot];

// Let Metro resolve packages within the monorepo
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// Intercept Node.js built-ins in React Native bundle
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'node:sqlite' || moduleName === 'sqlite') {
    return {
      filePath: path.resolve(projectRoot, 'src/shims/node-sqlite-shim.js'),
      type: 'sourceFile',
    };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
