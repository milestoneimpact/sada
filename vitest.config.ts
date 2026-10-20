import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // ‏`cloudflare:email` وحدةٌ في Worker وحدَه: يُستبدَل ببديلٍ يحفظ الرسالة ولا يرسلها (D-245)
  resolve: { alias: { 'cloudflare:email': fileURLToPath(new URL('./src/test/cloudflareEmail.ts', import.meta.url)) } },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
