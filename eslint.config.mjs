// ioBroker eslint template configuration file for js and ts files
// Please note that esm or react based modules need additional modules loaded.
import config, { esmConfig } from '@iobroker/eslint-config';

export default [
    ...config,

    {
        // specify files to exclude from linting here
        ignores: [
            '.dev-server/',
            '.vscode/',
            '*.test.js',
            'test/**/*.js',
            '*.config.mjs',
            'build',
            'admin/build',
            'admin/words.js',
            'admin/admin.d.ts',
            '**/adapter-config.d.ts',
            'admin/i18n',
            'node_modules',
            'www',
            './lib/protect-api-playback-stream.ts',
            'src-www/src/assets/lib/conn.js',
            'test'
        ],
    },

    {
        // you may disable some 'jsdoc' warnings - but using jsdoc is highly recommended
        // as this improves maintainability. jsdoc warnings will not block buiuld process.
        rules: {
            '@typescript-eslint/no-unused-vars': 'off',
            'jsdoc/require-jsdoc': 'off',
            'jsdoc/require-param-description': 'off',
            'jsdoc/require-returns-description': 'off',
            'jsdoc/check-alignment': 'off',
            'quote-props': 'off',
            '@typescript-eslint/no-namespace': 'off',
            '@typescript-eslint/ban-ts-comment': 'off',
            '@typescript-eslint/no-redundant-type-constituents': 'off',
            'prettier/prettier': 0,
            'no-else-return': 'off'
        },
    },

    ...esmConfig,
];
