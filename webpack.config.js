const path = require('path');
const TerserPlugin = require('terser-webpack-plugin');

const isDev = process.env.NODE_ENV === 'development';
const devtool = isDev ? 'source-map' : false;

module.exports = [
  // Entry 1: Main process
  {
    mode: isDev ? 'development' : 'production',
    devtool,
    entry: './src/main.ts',
    target: 'electron-main',
    output: {
      filename: 'main.js',
      path: path.resolve(__dirname, 'dist'),
      libraryTarget: 'commonjs2',
    },
    module: {
      rules: [
        {
          test: /\.ts$/,
          use: 'ts-loader',
          exclude: /node_modules/,
        },
      ],
    },
    resolve: {
      extensions: ['.ts', '.js'],
    },
    externals: {
      electron: 'commonjs2 electron',
    },
    optimization: {
      minimize: !isDev,
      minimizer: [
        new TerserPlugin({
          terserOptions: {
            compress: {
              pure_funcs: ['console.debug', 'console.trace'],
            },
          },
        }),
      ],
    },
  },
];
