import path from 'node:path';

/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['pdf-parse', '@huggingface/transformers'],
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=()' },
          { key: 'X-DNS-Prefetch-Control', value: 'off' },
        ],
      },
    ];
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Client (and worker) bundles must use the web build: the node build
      // references native/wasm internals webpack cannot resolve, and it is
      // never executed in the browser (all imports are lazy/dynamic).
      config.resolve.alias = {
        ...(config.resolve.alias ?? {}),
        '@huggingface/transformers':
          path.resolve('./node_modules/@huggingface/transformers/dist/transformers.web.min.js'),
        // Use the packaged WASM-capable runtime for the Transformers.js
        // backend entry. A false stub makes InferenceSession undefined at
        // runtime; the translation engine still tries WebGPU when available
        // and falls back to this reliable WASM provider.
        'onnxruntime-web/webgpu': path.resolve('./node_modules/onnxruntime-web/dist/ort.wasm.bundle.min.mjs'),
      };
    }
    return config;
  },
};
export default nextConfig;
