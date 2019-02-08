module.exports = {
  plugins: ['@babel/plugin-proposal-class-properties'],
  presets: [['@babel/preset-env', { modules: false, shippedProposals: true }]],
  env: {
    test: {
      presets: [
        ['@babel/preset-env', { modules: 'commonjs', shippedProposals: true }]
      ],
      plugins: [
        'transform-es2015-modules-commonjs',
        '@babel/plugin-transform-modules-commonjs'
      ]
    }
  }
};
