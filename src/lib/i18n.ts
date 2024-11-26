// ToDo: taken from https://github.com/ioBroker/adapter-core/blob/master/src/i18n.ts
// after adapter-core ^3.2.2 is default comming with js-controller 7.x this can be replace using utils.i18n

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

let language: ioBroker.Languages = 'en';
let words: null | Record<string, ioBroker.Translated> = null;

/**
 * Init internationalization
 *
 * @param rootDir The path, where i18n directory is located
 * @param languageOrAdapter The adapter instance or the language to use
 */
export async function init(rootDir: string, languageOrAdapter: ioBroker.Adapter | ioBroker.Languages): Promise<void> {
    let adapter: ioBroker.Adapter | undefined;
    if (languageOrAdapter && typeof languageOrAdapter === 'object') {
        adapter = languageOrAdapter;
        const systemConfig = await adapter.getForeignObjectAsync('system.config');
        if (systemConfig?.common.language) {
            language = systemConfig?.common.language;
        }
    } else {
        language = languageOrAdapter as ioBroker.Languages;
    }

    let files: string[];
    if (existsSync(join(rootDir, 'i18n'))) {
        files = readdirSync(join(rootDir, 'i18n'));
    } else if (existsSync(join(rootDir, 'lib', 'i18n'))) {
        rootDir = join(rootDir, 'lib');
        files = readdirSync(join(rootDir, 'i18n'));
    } else {
        throw new Error('Cannot find i18n directory');
    }

    words = {};

    let count = 0;
    files.forEach((file: string) => {
        if (file.endsWith('.json')) {
            count++;
            const lang: ioBroker.Languages = file.split('.')[0] as ioBroker.Languages;
            const wordsForLanguage = JSON.parse(readFileSync(join(rootDir, 'i18n', file)).toString('utf8'));
            Object.keys(wordsForLanguage).forEach((key: string) => {
                if (words) {
                    if (!words[key]) {
                        words[key] = {} as ioBroker.Translated;
                    }
                    words[key][lang] = wordsForLanguage[key];
                }
            });
        }
    });

    if (!count) {
        // may be it is an old structure: i18n/lang/translation.json
        files.forEach((file: string) => {
            if ((file.match(/^[a-z]{2}$/) || file === 'zh-cn') && statSync(join(rootDir, 'i18n', file)).isDirectory()) {
                if (adapter) {
                    // adapter.log.warn(
                    //     'Looks like you use old structure of i18n. ' +
                    //     'Please switch to 1i8n/lang.json instead of i18n/lang/translation.json',
                    // );
                }
                const lang: ioBroker.Languages = file as ioBroker.Languages;
                if (existsSync(join(rootDir, 'i18n', lang, 'translations.json'))) {
                    const wordsForLanguage = JSON.parse(
                        readFileSync(join(rootDir, 'i18n', lang, 'translations.json')).toString('utf8'),
                    );
                    Object.keys(wordsForLanguage).forEach((key: string) => {
                        if (words) {
                            if (!words[key]) {
                                words[key] = {} as ioBroker.Translated;
                            }
                            words[key][lang] = wordsForLanguage[key];
                        }
                    });
                }
            }
        });
    }
}

/**
 * Get translation as one string
 *
 * @param key Word to translate
 * @param args Optional parameters to replace %s
 */
export function translate(key: string, ...args: (string | number | boolean | null)[]): string {
    if (!words) {
        throw new Error("i18n not initialized. Please call 'init(__dirname, adapter)' before");
    }
    if (!words[key]) {
        return key;
    }
    let text = words[key][language] || words[key].en || key;
    if (args.length) {
        for (const arg of args) {
            text = text.replace('%s', arg === null ? 'null' : arg.toString());
        }
    }
    return text;
}

/**
 * Get translation as ioBroker.Translated object
 *
 * @param key Word to translate
 * @param args Optional parameters to replace %s
 */
export function getTranslatedObject(key: string, ...args: (string | number | boolean | null)[]): ioBroker.Translated {
    if (!words) {
        throw new Error("i18n not initialized. Please call 'init(__dirname, adapter)' before");
    }

    if (words[key]) {
        const word = words[key];
        if (word.en && word.en.includes('%s')) {
            const result: Partial<ioBroker.Translated> = {};
            Object.keys(word).forEach((lang: string) => {
                for (const arg of args) {
                    (result as Record<string, string>)[lang] = (word as Record<string, string>)[lang].replace(
                        '%s',
                        arg === null ? 'null' : arg.toString(),
                    );
                }
            });
            return result as ioBroker.Translated;
        }

        return words[key];
    }

    return {
        en: key,
    };
}
