'use strict';

// Replaces @iobroker/adapter-core with a stub, so src/main.ts can be imported without a js-controller.
// ESM imports are covered by the resolve hook, CJS requires (tsx compiles TS to CJS under mocha) by the patch below.
const Module = require('node:module');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
Module.register(pathToFileURL(path.join(__dirname, 'adapter-core.hooks.mjs')).href);

// src/lib/myIob.ts is a symlink to ../shared/myIob.ts. Node resolves its imports from the real path,
// where neither ./helper.js nor node_modules exist. Requests from that real path are resolved as if
// they came from the symlink location src/lib instead.
const projectRoot = path.resolve(__dirname, '..');
const srcLibDir = path.join(projectRoot, 'src', 'lib');
const sharedDir = path.dirname(fs.realpathSync(path.join(srcLibDir, 'myIob.ts')));
const ADAPTER_CORE_STUB = path.join(__dirname, 'stubs', 'adapter-core.cjs');
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveTestOverrides(request, parent, ...rest) {
	if (request === '@iobroker/adapter-core') {
		return ADAPTER_CORE_STUB;
	}
	if (parent?.filename?.startsWith(sharedDir + path.sep)) {
		if (request.startsWith('.')) {
			request = path.resolve(srcLibDir, request);
		} else {
			parent = {
				...parent,
				filename: path.join(srcLibDir, path.basename(parent.filename)),
				paths: Module._nodeModulePaths(srcLibDir),
			};
		}
	}
	return originalResolveFilename.call(this, request, parent, ...rest);
};

// Makes ts-node ignore warnings, so mocha --watch does work
process.env.TS_NODE_IGNORE_WARNINGS = 'TRUE';
// Sets the correct tsconfig for testing
process.env.TS_NODE_PROJECT = 'tsconfig.json';
// Make ts-node respect the "include" key in tsconfig.json
process.env.TS_NODE_FILES = 'TRUE';

// Don't silently swallow unhandled rejections
process.on('unhandledRejection', (e) => {
	throw e;
});

// enable the should interface with sinon
// and load chai-as-promised and sinon-chai by default
const sinonChai = require('sinon-chai');
const chaiAsPromised = require('chai-as-promised');
const { should, use } = require('chai');

should();
use(sinonChai);
use(chaiAsPromised);