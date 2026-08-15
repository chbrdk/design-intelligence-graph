import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['__tests__/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      '@msqdx/ui': path.resolve(__dirname, './lib/msqdx-ui.ts'),
      '@msqdx/ui-shell': path.resolve(__dirname, './lib/msqdx-ui-shell.ts'),
    },
  },
})
