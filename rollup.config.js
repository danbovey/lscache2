import babel from 'rollup-plugin-babel';
import { uglify } from 'rollup-plugin-uglify';

const babelConfig = require('./babel.config');

module.exports = [
  {
    input: 'src/index.js',
    output: {
      file: 'dist/lscache.js',
      format: 'umd',
      name: 'lscache'
    },
    plugins: [
      babel(babelConfig)
    ]
  },
  {
    input: 'src/index.js',
    output: {
      file: 'dist/lscache.min.js',
      format: 'umd',
      name: 'lscache'
    },
    plugins: [
      babel(babelConfig),
      uglify()
    ]
  }
];
