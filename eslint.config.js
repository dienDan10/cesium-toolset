import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import prettier from 'eslint-plugin-prettier';
import eslintConfigPrettier from 'eslint-config-prettier/flat';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
    globalIgnores(['dist', 'node_modules']),
    {
        files: ['**/*.{js,jsx}'],
        extends: [
            js.configs.recommended,
            reactHooks.configs.flat.recommended,
            reactRefresh.configs.vite,
        ],
        plugins: {
            prettier,
        },
        rules: {
            'prettier/prettier': [
                'warn',
                {
                    singleQuote: true,
                    semi: true,
                    trailingComma: 'all',
                    printWidth: 100,
                    endOfLine: 'auto',
                    tabWidth: 4,
                },
            ],
        },
        languageOptions: {
            globals: {
                ...globals.browser,
                Cesium: 'readonly',
            },
            parserOptions: { ecmaFeatures: { jsx: true } },
        },
    },
    eslintConfigPrettier,
]);
