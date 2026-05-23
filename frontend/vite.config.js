import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

const monacoNlsDefault = path.resolve(__dirname, 'node_modules/monaco-editor/esm/nls.messages.js')
const monacoNlsZhCN = path.resolve(__dirname, 'node_modules/monaco-editor/esm/nls.messages.zh-cn.js')

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      [monacoNlsDefault]: monacoNlsZhCN,
    },
  },
  build: {
    rollupOptions: {
      onwarn(warning, warn) {
        if (warning.code === 'MODULE_LEVEL_DIRECTIVE' && warning.message.includes("'use client'")) {
          return
        }
        warn(warning)
      },
    },
  },
})
