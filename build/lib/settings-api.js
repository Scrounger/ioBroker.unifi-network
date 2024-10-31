// Number of API errors to accept before we backoff so we don't slam a Protect controller.
export const API_ERROR_LIMIT = 10;
// Interval, in seconds, to wait before trying to access the API again once we've hit the PROTECT_API_ERROR_LIMIT threshold.
export const API_RETRY_INTERVAL = 300;
// Protect API response timeout, in milliseconds. This should never be greater than 5 seconds.
export const API_TIMEOUT = 4000;
