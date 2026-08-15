import type { NextConfig } from 'next'
import path from 'node:path'

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname, '../..'),
  webpack: (config) => {
    const appNodeModules = path.resolve(__dirname, 'node_modules')
    config.resolve = config.resolve || {}
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      '@msqdx/ui': path.resolve(__dirname, './lib/msqdx-ui.ts'),
      '@msqdx/ui-shell': path.resolve(__dirname, './lib/msqdx-ui-shell.ts'),
      '@msqdx/ui/styles.css': path.resolve(__dirname, '../../../msqdx-ui/packages/ui/src/styles.css'),
      '@msqdx/ui-tokens': path.resolve(__dirname, '../../../msqdx-ui/packages/ui-tokens/dist/index.js'),
      react: path.resolve(__dirname, 'node_modules/react'),
      'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
      'react/jsx-runtime': path.resolve(__dirname, 'node_modules/react/jsx-runtime.js'),
      'react/jsx-dev-runtime': path.resolve(__dirname, 'node_modules/react/jsx-dev-runtime.js'),
    }
    config.resolve.modules = [
      appNodeModules,
      ...(Array.isArray(config.resolve.modules)
        ? config.resolve.modules
        : config.resolve.modules
          ? [config.resolve.modules]
          : ['node_modules']),
    ]
    return config
  },
}

export default nextConfig
