import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', '.next']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [js.configs.recommended, reactHooks.configs.flat.recommended],
    languageOptions: {
      // Next.js App Router berjalan di browser maupun server (Node), jadi butuh dua globals ini.
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // Diturunkan ke warning: rule ini menandai pola "fetch di useEffect lalu
      // setState" yang dipakai hampir di semua halaman dashboard (loadData().then(setX)).
      // Itu pola standar & aman untuk loading state, bukan bug — mematikannya
      // sepenuhnya menyembunyikan kasus lain yang mungkin benar-benar perlu dibenahi,
      // tapi tidak perlu menggagalkan lint untuk pola yang sudah disengaja ini.
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
])
