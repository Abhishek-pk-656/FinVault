# Build, Packaging & Styling Pipeline Blueprint

## 1. Executive Summary
This document defines the production build, packaging, Tailwind CSS styling configuration, and quality verification pipeline for the FinVault Next.js 14 Web Application Cockpit (`apps/web`).

---

## 2. Tailwind CSS Configuration & Venzer Token Integration

### 2.1 File Location: `apps/web/tailwind.config.ts`
The Tailwind configuration for `apps/web` directly imports and applies the Venzer Botanical Minimalist design tokens specified in ADR-007, `docs/03-DESIGN-SYSTEM.md`, and `.agents/rules/02-frontend-mobile-standards.md`.

```typescript
import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
    '../../packages/ui/src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Venzer Botanical Minimalist Palette
        obsidianCarbon: '#040A0A',
        softMint: '#DEEEDA',
        mossCeladon: '#C7E0BA',
        oliveLeaf: '#7AAA4A',
        sageSlate: '#90A999',
        slateBase: '#38424C',
        alertImbalance: '#E06A55',

        // Semantic convenience aliases matching existing UI components
        obsidian: '#040A0A',
        surface: '#DEEEDA',
        pistachio: '#C7E0BA',
        botanicalGreen: '#7AAA4A',
        mutedSage: '#90A999',
        charcoalSlate: '#38424C',
      },
      borderRadius: {
        '3xl': '24px', // Card and container radius
        'xl': '12px',  // Interactive inputs and buttons
      },
      transitionDuration: {
        '150': '150ms', // Strictly <= 180ms ease-out
      },
      transitionTimingFunction: {
        'ease-out': 'cubic-bezier(0, 0, 0.2, 1)',
      },
    },
  },
  plugins: [],
};

export default config;
```

### 2.2 Global Styles & Typography: `apps/web/src/app/globals.css`
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --bg-obsidian: #040A0A;
  --surface-mint: #DEEEDA;
  --border-celadon: #C7E0BA;
  --accent-olive: #7AAA4A;
  --text-slate: #38424C;
  --text-muted: #90A999;
}

body {
  background-color: var(--bg-obsidian);
  color: var(--surface-mint);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* Ensure all interactive transitions respect <= 180ms constraint */
* {
  transition-duration: 150ms;
}
```

---

## 3. Monorepo Module Resolution & Solution-Style TypeScript Config

### 3.1 Workspace Linking (`tsconfig.base.json`)
The monorepo enforces direct TypeScript resolution across packages without requiring intermediate compilation steps during development:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["DOM", "DOM.Iterable", "ES2022"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "skipLibCheck": true,
    "paths": {
      "@finvault/db-types": ["./packages/db-types/src/index.ts"],
      "@finvault/sync-engine": ["./packages/sync-engine/src/index.ts"],
      "@finvault/ui": ["./packages/ui/src/index.tsx"],
      "@finvault/ui/tokens": ["./packages/ui/src/tokens.ts"]
    }
  }
}
```

### 3.2 App Configuration (`apps/web/tsconfig.json`)
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "preserve",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "noEmit": true,
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ]
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

---

## 4. Build, Linting & Typecheck Verification Commands

### 4.1 Granular Verification Commands
```powershell
# 1. Typecheck the web application
pnpm --filter @finvault/web typecheck

# 2. Typecheck the UI library
pnpm --filter @finvault/ui typecheck

# 3. Production build of Next.js web application
pnpm --filter @finvault/web build

# 4. Linting check
pnpm --filter @finvault/web lint
```

### 4.2 Turborepo Monorepo Orchestration
```powershell
# Build all packages and web app in dependency order
pnpm turbo run build --filter=@finvault/web...

# Run typecheck across all workspace packages
pnpm turbo run typecheck
```

---

## 5. Environment Variable Contract

The Next.js web cockpit requires the following environment variables (stored in `.env.local` for development and Vercel/production settings):

| Variable | Scope | Description | Default / Example |
| :--- | :--- | :--- | :--- |
| `NEXT_PUBLIC_SUPABASE_URL` | Client & Server | URL of the Supabase project / local emulator | `http://localhost:54321` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client & Server | Public anonymous API key for PostgREST & Auth | `anon-key-string` |
| `SUPABASE_SERVICE_ROLE_KEY` | Server Only (Optional) | Administrative key for maintenance tasks | `[SECRET - NEVER IN CLIENT]` |
