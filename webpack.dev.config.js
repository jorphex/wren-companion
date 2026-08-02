const path = require('path')
module.exports = [
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
    output: {
      publicPath: '',
      path: path.resolve(__dirname, 'dist'),
      filename: 'settings.js'
    },
    performance: {
      hints: false
    },
    plugins: [],
    watch: true
  }
]
