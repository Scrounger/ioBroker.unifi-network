'use strict';

// Test-only replacement for @iobroker/adapter-core.
// The real package calls process.exit(10) at import time when no js-controller is installed.
// Only the members used by src/main.ts at load time are provided here.

class Adapter {
    constructor(options) {
        this.options = options;
        this.handlers = {};
    }

    /** Stores the handler per event so tests can call it. */
    on(event, handler) {
        this.handlers[event] = handler;
        return this;
    }
}

module.exports = {
    Adapter,
    I18n: {
        init: async () => undefined,
    },
    getAbsoluteDefaultDataDir: () => '',
};
