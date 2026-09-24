import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  build: {
    // По умолчанию Vite должен сам чистить dist/ перед сборкой, но на этой
    // машине почему-то не чистил — файлы от каждого прошлого запуска molча
    // копились (до полусотни лишних JS/CSS). Указываем явно, чтобы не
    // зависеть от эвристики автоопределения.
    emptyOutDir: true
  },
  server: {
    host: '127.0.0.1',
    proxy: {
      '/api/yandex-stt': {
        target: 'https://stt.api.cloud.yandex.net',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/yandex-stt/, '')
      },
      '/api/yandex-llm': {
        target: 'https://llm.api.cloud.yandex.net',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/yandex-llm/, '')
      }
    }
  }
})
