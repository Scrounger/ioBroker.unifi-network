/**
 * Capture rules and interactive scenarios for recorded real-time events (local fixtures only).
 *
 * Pure functions and constants without side effects, shared by the recorder and the offline tests.
 * Event keys are taken from `WebSocketEvent`, so the scenarios stay in sync with the adapter code.
 */
import { ignoredWebSocketMessages, WebSocketEvent, WebSocketEventMessages } from '../src/lib/myTypes.js';

/** Maximum number of distinct devices, clients or users kept per cyclic message type. */
export const ENTITY_LIMIT = 5;

/** Cyclic message types the controller sends regularly. They are recorded automatically. */
export const CYCLIC_MESSAGES: readonly string[] = ['device:sync', 'client:sync', 'user:sync'];

/** Cyclic message prefixes, e.g. `vpn-users:sync`. Recorded automatically if they arrive. */
export const CYCLIC_PREFIXES: readonly string[] = ['vpn-users:'];

/** Cyclic messages the recorder waits for before it finishes. VPN users are optional. */
export const REQUIRED_CYCLIC_MESSAGES: readonly string[] = ['device:sync', 'client:sync', 'user:sync'];

/** Event keys the adapter evaluates in `onNetworkEvent`. Keys that are only logged are not included. */
export const HANDLED_EVENT_KEYS: readonly string[] = [
    ...WebSocketEvent.client.Connected,
    ...WebSocketEvent.client.Disconnected,
    ...WebSocketEvent.client.Roamed,
    ...WebSocketEvent.client.RoamedRadio,
    ...WebSocketEvent.client.Blocked,
    ...WebSocketEvent.client.Unblocked,
    ...WebSocketEvent.device.Restarted,
    ...WebSocketEvent.device.Connected,
    ...WebSocketEvent.device.Disconnected,
    ...WebSocketEvent.device.LostContact,
    ...WebSocketEvent.device.WANTransition,
    ...WebSocketEvent.device.Deleted,
];

/** Every event key the adapter knows, evaluated or only logged. Keys outside this list are unknown. */
export const KNOWN_EVENT_KEYS: readonly string[] = [
    ...Object.values(WebSocketEvent.device),
    ...Object.values(WebSocketEvent.client),
].flat();

/** Minimal shape of a WebSocket message as emitted by `NetworkApi`. */
export interface WsMessage {
    meta: { message: string; rc?: string };
    data?: unknown;
}

export type WsItem = Record<string, unknown>;

export function isRecord(value: unknown): value is WsItem {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Returns the object items of the message data. Empty if the data is not an array.
 *
 * @param message WebSocket message
 */
function itemsOf(message: WsMessage): WsItem[] {
    return Array.isArray(message.data) ? message.data.filter(isRecord) : [];
}

/**
 * Returns the items of an `events` message whose key the adapter evaluates.
 *
 * @param message WebSocket message
 */
export function handledEventItems(message: WsMessage): WsItem[] {
    if (message.meta.message !== 'events') {
        return [];
    }
    return itemsOf(message).filter((item: WsItem): boolean => typeof item.key === 'string' && HANDLED_EVENT_KEYS.includes(item.key));
}

/**
 * Returns the items of an `events` message whose key is not known to the adapter at all.
 * These are the items the adapter logs as `not implemented`.
 *
 * @param message WebSocket message
 */
export function unknownEventItems(message: WsMessage): WsItem[] {
    if (message.meta.message !== WebSocketEventMessages.events) {
        return [];
    }
    return itemsOf(message).filter((item: WsItem): boolean => typeof item.key === 'string' && !KNOWN_EVENT_KEYS.includes(item.key));
}

/**
 * Returns true for messages the adapter dispatches in `onNetworkMessage` or ignores on purpose.
 * Mirrors the dispatch there. A name for which this returns false is logged as `not implemented`.
 *
 * @param name `meta.message` of the message
 */
export function isKnownMessage(name: string): boolean {
    return name === WebSocketEventMessages.device
        || name === WebSocketEventMessages.events
        || name === WebSocketEventMessages.speedTest
        || name.startsWith(WebSocketEventMessages.client)
        || name.startsWith(WebSocketEventMessages.user)
        || name.startsWith(WebSocketEventMessages.wlanConf)
        || name.startsWith(WebSocketEventMessages.lanConf)
        || name.startsWith(WebSocketEventMessages.firewallGroup)
        || name.startsWith(WebSocketEventMessages.vpnUsers)
        || ignoredWebSocketMessages.includes(name);
}

/**
 * Returns true for cyclic messages, which are recorded without user action.
 *
 * @param name `meta.message` of the message
 */
export function isCyclicMessage(name: string): boolean {
    return CYCLIC_MESSAGES.includes(name) || CYCLIC_PREFIXES.some((prefix: string): boolean => name.startsWith(prefix));
}

/**
 * Returns true for messages the adapter evaluates and that are not sent cyclically.
 * `events` messages are handled per key, see `handledEventItems`.
 *
 * @param message WebSocket message
 */
export function isManualMessage(message: WsMessage): boolean {
    const name = message.meta.message;

    if (name === 'client:disconnected') {
        // Only VPN disconnects are handled, see onNetworkClientEvent
        return itemsOf(message).some((item: WsItem): boolean => item.type === 'VPN');
    }

    return name === 'user:delete'
        || name === 'speed-test:update'
        || name.startsWith('wlanconf:')
        || name.startsWith('networkconf')
        || name.startsWith('firewallgroup:');
}

/**
 * Returns true for messages that remove an entity from the controller.
 *
 * @param name `meta.message` of the message
 */
export function isDeleteMessage(name: string): boolean {
    return name.endsWith(':delete');
}

/**
 * Converts a message name into a file name, e.g. `device:sync` becomes `device-sync`.
 *
 * @param name `meta.message` or event key
 */
export function toFileName(name: string): string {
    return name.replace(/[^A-Za-z0-9_-]+/g, '-');
}

/**
 * Returns an identifier for an entity of a cyclic message: its MAC address or `_id`, else its serialized form.
 *
 * @param item entity from the message data
 */
export function entityId(item: unknown): string {
    if (isRecord(item)) {
        const id = item.mac ?? item._id;
        if (typeof id === 'string') {
            return id;
        }
    }
    return JSON.stringify(item);
}

/**
 * Interactive scenario. The recorder asks the user to trigger the action and waits until a matching message arrives.
 */
export interface Scenario {
    /** Stable id, used by the `--only` option. */
    id: string;
    /** Text shown to the user, describes the action to trigger. */
    prompt: string;
    /** Destructive scenarios remove data on the controller. They are only asked with `--destructive`. */
    destructive: boolean;
    /** Returns true if the message satisfies the scenario. */
    matches: (message: WsMessage) => boolean;
}

/**
 * Builds a matcher for `events` messages with one of the given keys.
 *
 * @param keys event keys of the scenario
 */
function onEvent(keys: readonly string[]): (message: WsMessage) => boolean {
    return (message: WsMessage): boolean => handledEventItems(message).some((item: WsItem): boolean => keys.includes(String(item.key)));
}

/**
 * Builds a matcher for messages with the given name.
 *
 * @param name `meta.message` to match
 */
function onMessage(name: string): (message: WsMessage) => boolean {
    return (message: WsMessage): boolean => message.meta.message === name;
}

/**
 * Builds a matcher for messages with a name prefix that are not delete messages.
 *
 * @param prefix name prefix
 */
function onChange(prefix: string): (message: WsMessage) => boolean {
    return (message: WsMessage): boolean => message.meta.message.startsWith(prefix) && !isDeleteMessage(message.meta.message);
}

/**
 * Builds a matcher for delete messages with a name prefix.
 *
 * @param prefix name prefix
 */
function onDelete(prefix: string): (message: WsMessage) => boolean {
    return (message: WsMessage): boolean => message.meta.message.startsWith(prefix) && isDeleteMessage(message.meta.message);
}

export const SCENARIOS: readonly Scenario[] = [
    {
        id: 'client-connected',
        prompt: 'Client neu verbinden (z.B. WLAN-Gerät aus- und wieder einschalten)',
        destructive: false,
        matches: onEvent(WebSocketEvent.client.Connected),
    },
    {
        id: 'client-disconnected',
        prompt: 'Client trennen (z.B. WLAN am Gerät ausschalten oder Kabel ziehen)',
        destructive: false,
        matches: onEvent(WebSocketEvent.client.Disconnected),
    },
    {
        id: 'client-roamed',
        prompt: 'Mobiles WLAN-Gerät zwischen zwei Access Points wechseln lassen (Roaming)',
        destructive: false,
        matches: onEvent(WebSocketEvent.client.Roamed),
    },
    {
        id: 'client-roamed-radio',
        prompt: 'Client wechselt den Funkkanal (schwer auslösbar, notfalls überspringen)',
        destructive: false,
        matches: onEvent(WebSocketEvent.client.RoamedRadio),
    },
    {
        id: 'client-blocked',
        prompt: 'Client in der UI blockieren und danach wieder freigeben',
        destructive: false,
        matches: onEvent([...WebSocketEvent.client.Blocked, ...WebSocketEvent.client.Unblocked]),
    },
    {
        id: 'device-restarted',
        prompt: 'Access Point oder Switch neu starten',
        destructive: false,
        matches: onEvent(WebSocketEvent.device.Restarted),
    },
    {
        id: 'device-connection',
        prompt: 'Gerät kurz vom Netz trennen und danach wieder anschließen',
        destructive: false,
        matches: onEvent([...WebSocketEvent.device.Disconnected, ...WebSocketEvent.device.Connected]),
    },
    {
        id: 'device-lost-contact',
        prompt: 'Verbindung eines Geräts zum Controller unterbrechen (z.B. Netzwerkkabel ziehen)',
        destructive: false,
        matches: onEvent(WebSocketEvent.device.LostContact),
    },
    {
        id: 'wan-transition',
        prompt: 'WAN-Verbindung des Gateways unterbrechen oder wechseln (falls möglich)',
        destructive: false,
        matches: onEvent(WebSocketEvent.device.WANTransition),
    },
    {
        id: 'vpn-disconnect',
        prompt: 'VPN-Client-Verbindung trennen',
        destructive: false,
        matches: (message: WsMessage): boolean => message.meta.message === 'client:disconnected' && isManualMessage(message),
    },
    {
        id: 'speed-test',
        prompt: 'Speedtest in der UI starten',
        destructive: false,
        matches: onMessage('speed-test:update'),
    },
    {
        id: 'wlan-config',
        prompt: 'WLAN-Einstellung ändern und danach zurücksetzen',
        destructive: false,
        matches: onChange('wlanconf:'),
    },
    {
        id: 'lan-config',
        prompt: 'Netzwerk-Einstellung (LAN) ändern und danach zurücksetzen',
        destructive: false,
        matches: onChange('networkconf'),
    },
    {
        id: 'firewall-group',
        prompt: 'Firewall-Gruppe ändern und danach zurücksetzen (Overview -> Network Lists)',
        destructive: false,
        matches: onChange('firewallgroup:'),
    },
    {
        id: 'device-deleted',
        prompt: 'Gerät aus dem Controller entfernen',
        destructive: true,
        matches: onEvent(WebSocketEvent.device.Deleted),
    },
    {
        id: 'client-removed',
        prompt: 'Client in der UI aus dem Controller löschen (manuelle Nachricht user:delete, nicht zyklisch)',
        destructive: true,
        matches: onMessage('user:delete'),
    },
    {
        id: 'wlan-delete',
        prompt: 'WLAN-Einstellung löschen',
        destructive: true,
        matches: onDelete('wlanconf:'),
    },
    {
        id: 'lan-delete',
        prompt: 'Netzwerk (LAN) löschen',
        destructive: true,
        matches: onDelete('networkconf'),
    },
    {
        id: 'firewall-delete',
        prompt: 'Firewall-Gruppe löschen',
        destructive: true,
        matches: onDelete('firewallgroup:'),
    },
];
