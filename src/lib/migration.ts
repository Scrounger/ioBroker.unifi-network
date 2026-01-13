
export async function migration(adapter: ioBroker.myAdapter) {
    const logPrefix = '[migration]:';

    try {
        // if (isVersionGreaterThan(adapter.version, '1.3.1')) {
        //     if (await adapter.objectExists('lan')) {
        //         await adapter.delObjectAsync('lan', { recursive: true });

        //         adapter.log.warn(`${logPrefix} Breaking Change !!! Adapter Migration successful: 'lan' channel deleted.`);
        //     }
        // }
    } catch (error) {
        adapter.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
    }
}

function isVersionGreaterThan(version: string, comparisonVersion: string): boolean {
    const versionParts = version.split('.').map(Number);
    const comparisonParts = comparisonVersion.split('.').map(Number);

    for (let i = 0; i < Math.max(versionParts.length, comparisonParts.length); i++) {
        const vPart = versionParts[i] || 0; // Falls die Version kürzer ist, wird mit 0 aufgefüllt.
        const cPart = comparisonParts[i] || 0; // Gleiches für die Vergleichs-Version.

        if (vPart > cPart) {
            return true; // Version ist größer.
        } else if (vPart < cPart) {
            return false; // Version ist kleiner.
        }
        // Wenn beide Teile gleich sind, gehe weiter zum nächsten Teil.
    }

    return false; // Wenn die Version gleich ist, ist sie nicht größer.
}