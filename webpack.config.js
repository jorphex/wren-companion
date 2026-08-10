const TerserPlugin = require('terser-webpack-plugin')
const webpack = require('webpack')

const { buildDirectory, parseDesktopPort } = require('./scripts/build-options.cjs')

const outputPath = buildDirectory(__dirname, process.env.WREN_BUILD_DIRECTORY)
const desktopPort = parseDesktopPort(process.env.WREN_DESKTOP_PORT)
const endpointPlugin = new webpack.DefinePlugin({
  'globalThis.__WREN_DESKTOP_PORT__': JSON.stringify(desktopPort)
})

module.exports = [
  {
    mode: 'production',
    entry: './src/inject.js',
    output: {
      publicPath: '',
      path: outputPath,
      filename: 'inject.js'
    },
    performance: {
      hints: false
    }
  },
  {
    mode: 'production',
    entry: './src/frame.js',
    optimization: {
      minimizer: [
        new TerserPlugin({
          terserOptions: { keep_classnames: true, keep_fnames: true }
        })
      ]
    },
    output: {
      publicPath: '',
      path: outputPath,
      filename: 'frame.js'
    },
    performance: {
      hints: false
    }
  },
  {
    mode: 'production',
    entry: './src/settings',
    module: {
      rules: [
        {
          test: /\.(js|jsx)$/,
          exclude: /node_modules/,
          use: ['babel-loader']
        }
      ]
    },
    resolve: {
      extensions: ['*', '.js', '.jsx']
    },
    optimization: {
      minimizer: [
        new TerserPlugin({
          terserOptions: { keep_classnames: true, keep_fnames: true }
        })
      ]
    },
    output: {
      publicPath: '',
      path: outputPath,
      filename: 'settings.js'
    },
    performance: {
      hints: false
    }
  },
  {
    mode: 'production',
    entry: './src/index.js',
    output: {
      publicPath: '',
      path: outputPath,
      filename: 'index.js'
    },
    plugins: [endpointPlugin],
    performance: {
      hints: false
    }
  }
]
