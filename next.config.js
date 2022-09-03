/** @type {import('next').NextConfig} */

const withInterceptStdout = require('next-intercept-stdout');
module.exports = withInterceptStdout({
    reactStrictMode: true,
    swcMinify: true,
  },
  (text) => (text.includes('Duplicate atom key') ? '' : text),
);