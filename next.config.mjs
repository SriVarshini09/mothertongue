import path from 'node:path';

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: { serverComponentsExternalPackages: ['pdf-parse', '@huggingface/transformers'] },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Client (and worker) bundles must use the web build: the node build
      // references native/wasm internals webpack cannot resolve, and it is
      // never executed in the browser (all imports are lazy/dynamic).
      config.resolve.alias = {
        ...(config.resolve.alias ?? {}),
        '@huggingface/transformers':
          path.resolve('./node_modules/@huggingface/transformers/dist/transformers.web.min.js'),
        // WebGPU backend bundle breaks webpack parsing; stub it out so the
        // build succeeds. The loader tries WebGPU first and falls back to
        // WASM on failure — the reliable path for offline translation.
        'onnxruntime-web/webgpu': false,
      };
    }
    return config;
  },
};
export default nextConfig;
