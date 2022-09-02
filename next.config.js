/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
}

module.exports = nextConfig

const withInterceptStdout = require('next-intercept-stdout');
module.exports = withInterceptStdout({
    reactStrictMode: true,
  },
  (text) => (text.includes('Duplicate atom key') ? '' : text),
);