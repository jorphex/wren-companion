import eslint from '@eslint/js'
import prettier from 'eslint-config-prettier'
import react from 'eslint-plugin-react'
import globals from 'globals'

export default [
  {
    ignores: ['dist/**/*', 'dist-firefox/**/*', 'node_modules/**/*', 'src/style/fonts.css']
  },
  {
    files: ['**/*.{js,mjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: {
        ...globals.es2021
      }
    },
    rules: {
      ...eslint.configs.recommended.rules,
      'no-unused-vars': [
        'error',
        {
          args: 'after-used',
          argsIgnorePattern: '^_',
          caughtErrors: 'none',
          destructuredArrayIgnorePattern: '^_',
          ignoreRestSiblings: true
        }
      ]
    }
  },
  {
    files: [
      'webpack*.js',
      'scripts/**/*.{js,mjs}',
      'src/copy-static.js',
      'src/control-client.js',
      'src/page-session.js',
      'src/tab-session-state.js',
      'src/page-connection.js',
      'src/tab-session-state.js',
      'src/protocol.js',
      'src/provider-info.js',
      'src/provider.js',
      'test/**/*.js'
    ],
    languageOptions: {
      globals: {
        ...globals.node
      }
    }
  },
  {
    files: ['src/**/*.js', 'qualification/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.webextensions
      },
      parserOptions: {
        ecmaFeatures: {
          jsx: true
        }
      }
    }
  },
  {
    files: [
      'src/auth-protocol.js',
      'src/authentication-actions.js',
      'src/authenticated-socket.js',
      'src/credential-store.js',
      'src/frame.js',
      'src/index.js',
      'src/inject.js',
      'src/legacy-provider.js',
      'src/network-catalog-cache.js',
      'src/network-refresh.js',
      'src/page-connection.js',
      'src/timers.js'
    ],
    languageOptions: {
      globals: {
        module: 'readonly',
        require: 'readonly'
      },
      sourceType: 'commonjs'
    }
  },
  {
    files: ['src/settings/**/*.js'],
    plugins: {
      react
    },
    settings: {
      react: {
        version: 'detect'
      }
    },
    rules: {
      ...react.configs.recommended.rules,
      ...react.configs['jsx-runtime'].rules,
      'react/prop-types': 'off'
    }
  },
  prettier
]
