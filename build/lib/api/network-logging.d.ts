/**
 * Logging interface for this library that you can optionally specify.
 *
 * This interface allows you to leverage your own custom logging capabilities, if you so choose. By default, logging will be done to the console. If you use your own,
 * you will need to specify the functions to use for the various alert levels that the library uses: `debug`, `error`, `info`, and `warn`.
 *
 * @module NetworkLogging
 */
/**
 * Logging interface, leveraging what we do for Homebridge and elsewhere as a good template.
 *
 * @remarks By default, logging is done to the console. If you use your own logging functions, you must specify all the alert levels that the library uses: `debug`,
 * `error`, `info`, and `warn`.
 */
export interface NetworkLogging {
    silly?(message: string): void;
    debug(message: string): void;
    error(message: string): void;
    info(message: string): void;
    warn(message: string): void;
}
