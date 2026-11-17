/**
 * Anonymization for recorded UniFi API responses (local fixtures only).
 *
 * - MAC addresses, IPv4/IPv6 addresses, UUIDs and 24-character hex ObjectIDs are replaced by placeholders
 *   from reserved ranges (locally administered MAC, RFC 2544 benchmark IPs, RFC 3849 documentation
 *   prefix, UUIDs in the 00000000-0000-4000-8000 range, zero-padded IDs).
 * - Values under name-like keys (name, ssid, email, serial, user, note, comment, tags, city, dns record,
 *   remote ip override) and free text containing these values are replaced by `name-N`.
 * - Values under secret-like keys (pass, secret, token, cookie, key, psk, private, configuration file)
 *   are replaced by `<redacted>`.
 * - URL hosts are replaced by `host.invalid`, the path is kept.
 * - Version strings keep their value, because a dotted version can look like an IPv4 address.
 * - Literal secrets (controller host, user, password) are removed from all strings.
 * - Object keys are anonymized the same way as values, so identifiers used as keys are covered too.
 *
 * Placeholders are consistent within one `anonymize` call, so references between entities stay intact.
 * The mapping is kept in memory only and is never written to disk.
 */

const MAC_PATTERN = /\b(?:[0-9a-f]{2}[:-]){5}[0-9a-f]{2}\b/gi;
const IPV4_PATTERN = /\b\d{1,3}(?:\.\d{1,3}){3}\b/g;
const OBJECT_ID_PATTERN = /\b[0-9a-f]{24}\b/gi;
const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
// Full and compressed IPv6 forms. Requires `::` or eight groups, so MAC addresses and times are not matched.
const IPV6_PATTERN =
    /(?<![0-9a-z:])(?:(?:[0-9a-f]{1,4}:){7}[0-9a-f]{1,4}|(?:[0-9a-f]{1,4}:){1,7}:|(?:[0-9a-f]{1,4}:){1,6}:[0-9a-f]{1,4}|(?:[0-9a-f]{1,4}:){1,5}(?::[0-9a-f]{1,4}){1,2}|(?:[0-9a-f]{1,4}:){1,4}(?::[0-9a-f]{1,4}){1,3}|(?:[0-9a-f]{1,4}:){1,3}(?::[0-9a-f]{1,4}){1,4}|(?:[0-9a-f]{1,4}:){1,2}(?::[0-9a-f]{1,4}){1,5}|[0-9a-f]{1,4}:(?::[0-9a-f]{1,4}){1,6}|:(?:(?::[0-9a-f]{1,4}){1,7}|:))(?![0-9a-z:])/gi;

const PLACEHOLDER_MAC = /^02:00:00:00:[0-9a-f]{2}:[0-9a-f]{2}$/;
const PLACEHOLDER_IPV4 = /^198\.18\.\d{1,3}\.\d{1,3}$/;
const PLACEHOLDER_OBJECT_ID = /^0{16}[0-9a-f]{8}$/;
const PLACEHOLDER_IPV6 = /^2001:db8::[0-9a-f]{1,4}$/i;
const PLACEHOLDER_UUID = /^00000000-0000-4000-8000-[0-9a-f]{12}$/i;

const SECRET_KEY = /pass|secret|token|cookie|key|psk|private|configuration_file/i;
const NAME_KEY = /name|ssid|email|serial|^user$|note|comment|tags|city|dns_record|remote_ip_override|desc/i;
const VERSION_KEY = /version/i;
const VERSION_FIELD = /"[^"]*version[^"]*"\s*:\s*"[^"]*"/gi;
const URL_PATTERN = /\b([a-z][a-z0-9+.-]*:\/\/)[^\s"'<>\\/]+/gi;
const URL_HOST = 'host.invalid';
// Entries of these types or with these keys hold credentials. They are dropped as a whole.
const SECRET_ENTRY_TYPES = new Set<string>(['wireguard-client']);
const SECRET_ENTRY_KEY = /private_key|preshared/i;

const REDACTED = '<redacted>';
const MIN_NAME_LENGTH = 3;
const MIN_SECRET_LENGTH = 4;

/**
 * Assigns placeholders in order of first appearance, one map per value type.
 */
class Placeholders {
    private readonly macs = new Map<string, string>();
    private readonly ips = new Map<string, string>();
    private readonly objectIds = new Map<string, string>();
    private readonly names = new Map<string, string>();
    private readonly ipv6s = new Map<string, string>();
    private readonly uuids = new Map<string, string>();

    public mac(value: string): string {
        return lookup(this.macs, value.toLowerCase().replace(/-/g, ':'), (index: number): string => {
            if (index > 0xffff) {
                throw new Error('Too many distinct MAC addresses for placeholders');
            }
            return `02:00:00:00:${toHex(index >> 8)}:${toHex(index & 0xff)}`;
        });
    }

    public ip(value: string): string {
        return lookup(this.ips, value, (index: number): string => {
            if (index > 0xffff) {
                throw new Error('Too many distinct IPv4 addresses for placeholders');
            }
            return `198.18.${index >> 8}.${index & 0xff}`;
        });
    }

    public objectId(value: string): string {
        return lookup(this.objectIds, value.toLowerCase(), (index: number): string => `${'0'.repeat(16)}${index.toString(16).padStart(8, '0')}`);
    }

    public name(value: string): string {
        return lookup(this.names, value, (index: number): string => `name-${index}`);
    }

    public ipv6(value: string): string {
        return lookup(this.ipv6s, value.toLowerCase(), (index: number): string => {
            if (index > 0xffff) {
                throw new Error('Too many distinct IPv6 addresses for placeholders');
            }
            return `2001:db8::${index.toString(16)}`;
        });
    }

    public uuid(value: string): string {
        return lookup(this.uuids, value.toLowerCase(), (index: number): string => `00000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`);
    }
}

function toHex(value: number): string {
    return value.toString(16).padStart(2, '0');
}

function lookup(map: Map<string, string>, key: string, format: (index: number) => string): string {
    let placeholder = map.get(key);
    if (placeholder === undefined) {
        placeholder = format(map.size + 1);
        map.set(key, placeholder);
    }
    return placeholder;
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Builds one pattern for all literal values. Longer values are matched first.
 * Returns `null` if there is nothing to match.
 *
 * @param literals literal values to search for
 * @param wholeWord only match values that are not part of a longer word (e.g. `LAN` but not `wlan`)
 */
function buildLiteralPattern(literals: string[], wholeWord: boolean = false): RegExp | null {
    if (literals.length === 0) {
        return null;
    }
    const sorted = [...literals].sort((a, b) => b.length - a.length);
    const alternatives = sorted.map(escapeRegExp).join('|');
    if (wholeWord) {
        return new RegExp(`(?<![\\p{L}\\p{N}])(?:${alternatives})(?![\\p{L}\\p{N}])`, 'gu');
    }
    return new RegExp(alternatives, 'g');
}

/**
 * Replaces all matches of a prebuilt pattern in one pass.
 *
 * @param text text to process
 * @param pattern pattern from `buildLiteralPattern`
 * @param replacer function that returns the replacement for a match
 */
function replaceLiterals(text: string, pattern: RegExp | null, replacer: (match: string) => string): string {
    return pattern ? text.replace(pattern, replacer) : text;
}

interface Context {
    secretPattern: RegExp | null;
    namePattern: RegExp | null;
    placeholders: Placeholders;
}

function collectNames(value: unknown, key: string | undefined, names: Set<string>): void {
    if (typeof value === 'string') {
        if (key && NAME_KEY.test(key) && value.length >= MIN_NAME_LENGTH) {
            names.add(value);
        }
        return;
    }

    if (Array.isArray(value)) {
        for (const item of value) {
            collectNames(item, key, names);
        }
        return;
    }

    if (value && typeof value === 'object') {
        for (const [childKey, child] of Object.entries(value as Record<string, unknown>)) {
            collectNames(child, childKey, names);
        }
    }
}

interface TextOptions {
    /** Whether recorded names are replaced. Object keys pass `false`, because keys are part of the schema. */
    replaceNames?: boolean;
    /** Whether IPv4-shaped text is kept. Used for version strings. */
    keepIpv4?: boolean;
}

/**
 * Anonymizes free text.
 *
 * @param text text to process
 * @param context shared anonymization state
 * @param options which replacements apply to this text
 */
function anonymizeText(text: string, context: Context, options: TextOptions = {}): string {
    if (text.length === 0) {
        return text;
    }

    const withoutSecrets = replaceLiterals(text, context.secretPattern, () => REDACTED);
    const withoutNames = options.replaceNames === false
        ? withoutSecrets
        : replaceLiterals(withoutSecrets, context.namePattern, (match: string): string => context.placeholders.name(match));
    const withoutUrls = withoutNames.replace(URL_PATTERN, (_match: string, scheme: string): string => `${scheme}${URL_HOST}`);
    const withoutMacs = withoutUrls.replace(MAC_PATTERN, (match: string): string => context.placeholders.mac(match));
    const withoutIps = options.keepIpv4
        ? withoutMacs
        : withoutMacs.replace(IPV4_PATTERN, (match: string): string => context.placeholders.ip(match));
    const withoutIpv6 = withoutIps.replace(IPV6_PATTERN, (match: string): string => context.placeholders.ipv6(match));
    const withoutUuids = withoutIpv6.replace(UUID_PATTERN, (match: string): string => context.placeholders.uuid(match));
    return withoutUuids.replace(OBJECT_ID_PATTERN, (match: string): string => context.placeholders.objectId(match));
}

function anonymizeValue(value: unknown, key: string | undefined, context: Context): unknown {
    if (typeof value === 'string') {
        if (key && SECRET_KEY.test(key)) {
            return REDACTED;
        }
        if (key && NAME_KEY.test(key) && value.length > 0) {
            return context.placeholders.name(value);
        }
        return anonymizeText(value, context, { keepIpv4: key !== undefined && VERSION_KEY.test(key) });
    }

    if (Array.isArray(value)) {
        return value.map((item: unknown): unknown => anonymizeValue(item, key, context));
    }

    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>).map(([childKey, child]): [string, unknown] => [
                anonymizeText(childKey, context, { replaceNames: false }),
                anonymizeValue(child, childKey, context),
            ]),
        );
    }

    return value;
}

/**
 * Returns an anonymized deep copy of `value`. The input is not modified.
 *
 * @param value JSON-compatible data, e.g. recorded WebSocket events
 * @param secrets literal values that must not appear in the output (host, user, password)
 */
export function anonymize<T>(value: T, secrets: string[]): T {
    const names = new Set<string>();
    collectNames(value, undefined, names);

    const context: Context = {
        secretPattern: buildLiteralPattern(secrets.filter((secret: string): boolean => secret.length >= MIN_SECRET_LENGTH)),
        namePattern: buildLiteralPattern([...names], true),
        placeholders: new Placeholders(),
    };

    return anonymizeValue(value, undefined, context) as T;
}

/**
 * Removes entries that hold credentials as a whole, e.g. WireGuard client configurations. Redacting only the
 * secret fields would still leave the entry's structure in the fixture.
 *
 * @param value JSON-compatible data, e.g. the controller responses
 * @returns Copy of `value` without the credential entries
 */
export function removeSecretEntries<T>(value: T): T {
    return dropSecretEntries(value) as T;
}

function dropSecretEntries(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.filter((item: unknown): boolean => !isSecretEntry(item)).map((item: unknown): unknown => dropSecretEntries(item));
    }

    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>).map(([key, child]): [string, unknown] => [key, dropSecretEntries(child)]),
        );
    }

    return value;
}

function isSecretEntry(value: unknown): boolean {
    if (!value || typeof value !== 'object') {
        return false;
    }

    const entry = value as Record<string, unknown>;
    if (typeof entry.vpn_type === 'string' && SECRET_ENTRY_TYPES.has(entry.vpn_type)) {
        return true;
    }

    return Object.entries(entry).some(([key, child]): boolean => SECRET_ENTRY_KEY.test(key) && typeof child === 'string' && child.length > 0);
}

/**
 * Checks serialized output for remaining sensitive data.
 * Returns one label per finding. The found values are not included.
 *
 * @param serialized JSON text to check
 * @param secrets literal values that must not appear in the text
 */
export function findLeaks(serialized: string, secrets: string[]): string[] {
    const leaks: string[] = [];

    for (const secret of secrets) {
        if (secret.length >= MIN_SECRET_LENGTH && serialized.includes(secret)) {
            leaks.push('Zugangsdaten');
        }
    }

    for (const match of serialized.matchAll(MAC_PATTERN)) {
        if (!PLACEHOLDER_MAC.test(match[0])) {
            leaks.push('MAC-Adresse');
        }
    }

    // Version fields are exempt from the IPv4 check, the same way `anonymize` keeps them.
    for (const match of serialized.replace(VERSION_FIELD, '').matchAll(IPV4_PATTERN)) {
        if (!PLACEHOLDER_IPV4.test(match[0])) {
            leaks.push('IPv4-Adresse');
        }
    }

    for (const match of serialized.matchAll(OBJECT_ID_PATTERN)) {
        if (!PLACEHOLDER_OBJECT_ID.test(match[0])) {
            leaks.push('Objekt-ID');
        }
    }

    for (const match of serialized.matchAll(IPV6_PATTERN)) {
        if (!PLACEHOLDER_IPV6.test(match[0])) {
            leaks.push('IPv6-Adresse');
        }
    }

    for (const match of serialized.matchAll(UUID_PATTERN)) {
        if (!PLACEHOLDER_UUID.test(match[0])) {
            leaks.push('UUID');
        }
    }

    for (const match of serialized.matchAll(URL_PATTERN)) {
        if (match[0].slice(match[1].length) !== URL_HOST) {
            leaks.push('URL-Host');
        }
    }

    if (/PrivateKey\s*=/i.test(serialized)) {
        leaks.push('WireGuard-Schluessel');
    }

    return leaks;
}
