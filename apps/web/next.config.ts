import { readFileSync } from 'node:fs'
import type { NextConfig } from 'next'
import path from 'node:path'

const catalog = JSON.parse(
  readFileSync(path.join(__dirname, '../../knowledge/paths.json'), 'utf8'),
) as { imageIngest: { islandProxyMaxBody: string } }

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname, '../..'),
  experimental: {
    proxyClientMaxBodySize: catalog.imageIngest.islandProxyMaxBody as `${number}mb`,
  },
  webpack: (config) => {
    const appNodeModules = path.resolve(__dirname, 'node_modules')
    config.resolve = config.resolve || {}
    // Match checkion-v3: do not alias react/react-dom — Next 16 /_global-error
    // prerender breaks with useContext null when webpack forces a second React copy.
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      '@msqdx/ui': path.resolve(__dirname, './lib/msqdx-ui.ts'),
      '@msqdx/ui-shell': path.resolve(__dirname, './lib/msqdx-ui-shell.ts'),
      '@msqdx/ui/styles.css': path.resolve(__dirname, '../../../msqdx-ui/packages/ui/src/styles.css'),
      '@msqdx/ui-tokens': path.resolve(__dirname, '../../../msqdx-ui/packages/ui-tokens/dist/index.js'),
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
