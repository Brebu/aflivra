import {defineConfig, globalIgnores} from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';

const legacyExportSurfaces=[
  'app/catalog-workspace.tsx',
  'app/catalog/page.tsx',
  'app/cinema-workspace.tsx',
  'app/company-provenance.tsx',
  'app/courts-workspace.tsx',
  'app/events-workspace.tsx',
  'app/experience.tsx',
  'app/live-company.tsx',
  'app/live-data.tsx',
  'app/local-weather.tsx',
  'app/location-scope.tsx',
  'app/location.tsx',
  'app/page.tsx',
  'app/pagination.tsx',
  'app/places-workspace.tsx',
  'app/record-workspace.tsx',
  'app/search-input.tsx',
  'app/sources-registry.tsx',
  'app/stories-workspace.tsx',
  'app/transit-workspace.tsx',
  'app/use-source.ts',
  'app/weather-workspace.tsx',
  'components/ui/carousel.tsx'
];

export default defineConfig([
  ...nextVitals,
  globalIgnores([
    'dist/**',
    '.next/**',
    '.vinext/**',
    'node_modules/**',
    '.sites-runtime/**',
    '.wrangler/**',
    'vendor/**',
    'playwright-report/**',
    'test-results/**',
    'archives/**'
  ]),
  {
    // node-side verify harnesses deliberately build CommonJS `module` shims and call React hooks outside component trees — next/react-hooks app-code rules stay advisory there
    files: ['scripts/**/*.mjs'],
    rules: {
      '@next/next/no-assign-module-variable': 'warn',
      'react-hooks/rules-of-hooks': 'warn'
    }
  },
  {
    // the v35 export predates the react-hooks v7 compiler rules: advisories on these shipped screens stay visible as warnings instead of blocking, until the Wave-3 refactor removes the entries
    files: legacyExportSurfaces,
    rules: {
      '@next/next/no-html-link-for-pages': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/static-components': 'warn'
    }
  }
]);
