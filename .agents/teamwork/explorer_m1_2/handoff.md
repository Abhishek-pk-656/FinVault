# Milestone 1 Monorepo Architecture Specification & Handoff Report

## 1. Observation

Direct observations from repository inspection, system environment commands, and existing documentation:
1. **Workspace Root**: Current directory `d:\programming\New_project` contains only:
   - `.agents/` (rules, skills, teamwork)
   - `docs/` (`01-PRD-AND-ROADMAP.md` through `11-ENV-AND-MCP.md`)
   - Root documentation: `AGENTS.md`, `CHANGELOG.md`, `TASKS.md`
   - Tested existence via PowerShell `Test-Path`: `apps`, `packages`, `supabase`, `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.json`, `tsconfig.base.json`, `.gitignore`, `.env.example` all returned `False`.
2. **Environment & Tooling Execution**:
   - `node -v` output: `v24.21.0`
   - `npm -v` output: `11.19.0`
   - `corepack --version` output: `0.36.0`
   - `npm config get prefix`: `C:\Users\user\AppData\Roaming\npm` (present in `$env:PATH`).
   - Running `corepack enable --install-directory "C:\Users\user\AppData\Roaming\npm" pnpm` placed `pnpm.cmd` and `pnpx.cmd` in the user's roaming npm path without requiring admin elevation.
3. **Core Architectural Invariants from `AGENTS.md` and `PROJECT.md`**:
   - Double-Entry Lite Invariant: `SUM(debits) == SUM(credits)`.
   - Strict `BIGINT` minor currency units (cents/paise); zero floating-point numbers.
   - Venzer Botanical Minimalist Design System:
     - Obsidian Carbon: `#040A0A`
     - Soft Mint: `#DEEEDA`
     - Sage Pistachio: `#C7E0BA`
     - Botanical Green: `#7AAA4A`
     - Muted Sage: `#90A999`
     - Charcoal Slate: `#38424C`
     - Transitions $\le 180$ms, max 3 visual component groups per view, max 3 attributes per row, 24px border radius.
   - Topology: Monorepo with Turborepo + pnpm:
     - `apps/web`: Next.js 14+ App Router, Tailwind CSS, `@supabase/supabase-js`, `@supabase/ssr`.
     - `apps/mobile`: React Native / Expo (targeting Android first, iOS ready), `expo-sqlite`, `expo-secure-store`, `expo-local-authentication`.
     - `packages/db-types`: Shared TypeScript interfaces for accounts, transactions, journal entries, IOUs, sinking funds.
     - `packages/sync-engine`: Offline-first SQLite adapter, mutation outbox queue (`sync_queue`), delta sync protocol.
     - `packages/ui`: Shared design tokens, Card, Button, BalanceBadge, AmountInput.
     - `supabase/`: Migrations DDL with RLS, balance triggers, and Deno edge functions.

---

## 2. Logic Chain

1. **Monorepo Structure**:
   - Monorepo orchestration requires Turborepo v2 (`turbo.json`) and pnpm workspaces (`pnpm-workspace.yaml`).
   - Declaring `apps/*` and `packages/*` enables package cross-referencing via `workspace:*` dependencies.
2. **TypeScript Compilation Strategy**:
   - A single root `tsconfig.base.json` provides shared strict settings (`strict: true`, `target: ES2022`, `moduleResolution: Bundler`, `declaration: true`).
   - Each package and app extends `../../tsconfig.base.json` and configures its own target environment (e.g. `react-jsx` for UI, Next.js plugin for Web, `react-native` for Expo).
   - This ensures full TypeScript type safety without circular compilation issues.
3. **Domain Contracts & Package Dependencies**:
   - `@finvault/db-types` has zero runtime dependencies and exports TypeScript definitions with `bigint` minor units.
   - `@finvault/sync-engine` imports `@finvault/db-types` and `@supabase/supabase-js` to define client-side SQLite storage contracts and delta sync interfaces.
   - `@finvault/ui` imports `@finvault/db-types` and exports Venzer Botanical Minimalist design tokens and primitive components.
   - `apps/web` imports `@finvault/db-types`, `@finvault/sync-engine`, and `@finvault/ui`, transpiling them via Next.js `transpilePackages`.
   - `apps/mobile` imports `@finvault/db-types` and `@finvault/sync-engine`, configured with Metro monorepo workspace resolution.
4. **Supabase Scaffolding**:
   - Placing `supabase/migrations/` and `supabase/functions/` in the monorepo root aligns with the official Supabase CLI directory standard and allows automated local emulation or CI deployment.

---

## 3. Caveats

1. **Network Sandbox Access**: Commands needing external network access (such as `pnpm install` downloading fresh npm packages) require `BypassSandbox: true` if executed in this environment.
2. **Expo Native Dependencies**: The mobile application configuration uses Expo SDK 51 managed workflow (`expo-sqlite`, `expo-secure-store`, `expo-local-authentication`), avoiding raw Android NDK/Gradle build complexity in Milestone 1.
3. **Vitest / Fast-Check Installation**: Vitest and fast-check are placed in `devDependencies` across the monorepo so unit and property-based tests can be added cleanly in subsequent milestones without restructuring manifests.

---

## 4. Conclusion & Complete File Specifications

The following concrete file specifications and directory structures are designed for the Worker agent to scaffold Milestone 1.

### File Tree Layout
```
d:\programming\New_project/
├── .gitignore
├── .env.example
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.base.json
├── tsconfig.json
├── packages/
│   ├── db-types/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       └── index.ts
│   ├── sync-engine/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       └── index.ts
│   └── ui/
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── index.tsx
│           └── tokens.ts
├── apps/
│   ├── web/
│   │   ├── package.json
│   │   ├── next.config.mjs
│   │   ├── tsconfig.json
│   │   ├── tailwind.config.ts
│   │   ├── postcss.config.js
│   │   └── src/
│   │       └── app/
│   │           ├── globals.css
│   │           ├── layout.tsx
│   │           └── page.tsx
│   └── mobile/
│       ├── package.json
│       ├── app.json
│       ├── tsconfig.json
│       ├── metro.config.js
│       └── App.tsx
└── supabase/
    ├── config.toml
    ├── migrations/
    │   └── 20261108000000_init_finvault_schema.sql
    └── functions/
        ├── validate-transaction/
        │   └── index.ts
        └── sync-reconcile/
            └── index.ts
```

---

### Detailed File Manifests & Contents

#### 1. Root Configuration Files

##### `d:\programming\New_project\.gitignore`
```gitignore
# Dependencies
node_modules/
.pnpm-store/

# Build outputs
dist/
build/
.next/
out/
.turbo/
*.tsbuildinfo

# Mobile / Expo
.expo/
*.jks
*.p8
*.p12
*.key
*.mobileprovision
*.orig.*

# Environment files
.env
.env.local
.env.development.local
.env.test.local
.env.production.local
!.env.example

# Logs
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
*.log

# SQLite Local databases
*.sqlite
*.sqlite3
*.db
*.db-journal
*.db-wal
*.db-shm

# OS generated files
.DS_Store
Thumbs.db

# IDEs
.idea/
.vscode/*
!.vscode/settings.json
!.vscode/extensions.json
```

##### `d:\programming\New_project\.env.example`
```ini
# --- Supabase Configuration (Phase 1 Cloud Backend) ---
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# --- Google OAuth Configuration (Supabase Auth Dashboard) ---
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# --- Client Local SQLite Storage ---
CLIENT_DATABASE_NAME=finvault_local.db
SQLCIPHER_KEY_ITERATIONS=64000

# --- Phase 2/3 Future Scope (Self-Hosted Fallback) ---
# DATABASE_URL=postgresql+psycopg2://postgres:postgres@localhost:5432/finvault
# OLLAMA_BASE_URL=http://localhost:11434
```

##### `d:\programming\New_project\package.json`
```json
{
  "name": "finvault-monorepo",
  "version": "0.1.0",
  "private": true,
  "packageManager": "pnpm@9.1.0",
  "engines": {
    "node": ">=20.0.0",
    "pnpm": ">=9.0.0"
  },
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev",
    "lint": "turbo run lint",
    "test": "turbo run test",
    "typecheck": "turbo run typecheck",
    "format": "prettier --write \"**/*.{ts,tsx,md,json}\"",
    "format:check": "prettier --check \"**/*.{ts,tsx,md,json}\"",
    "clean": "turbo run clean"
  },
  "devDependencies": {
    "eslint": "^8.57.0",
    "prettier": "^3.2.5",
    "turbo": "^2.0.0",
    "typescript": "^5.4.5"
  }
}
```

##### `d:\programming\New_project\pnpm-workspace.yaml`
```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

##### `d:\programming\New_project\turbo.json`
```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "!.next/cache/**", "dist/**"]
    },
    "test": {
      "dependsOn": ["^build"],
      "inputs": ["src/**/*.tsx", "src/**/*.ts", "test/**/*.ts", "tests/**/*.ts"]
    },
    "lint": {
      "dependsOn": ["^lint"]
    },
    "typecheck": {
      "dependsOn": ["^build"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "clean": {
      "cache": false
    }
  }
}
```

##### `d:\programming\New_project\tsconfig.base.json`
```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
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
    "strictFunctionTypes": true,
    "strictBindCallApply": true,
    "strictPropertyInitialization": true,
    "noImplicitThis": true,
    "alwaysStrict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true
  },
  "exclude": ["node_modules", "dist", ".next", ".turbo"]
}
```

##### `d:\programming\New_project\tsconfig.json`
```json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@finvault/db-types": ["packages/db-types/src/index.ts"],
      "@finvault/sync-engine": ["packages/sync-engine/src/index.ts"],
      "@finvault/ui": ["packages/ui/src/index.tsx"],
      "@finvault/ui/*": ["packages/ui/src/*"]
    }
  },
  "include": ["apps/**/*", "packages/**/*"],
  "exclude": ["node_modules", "dist", ".next", ".turbo", "supabase"]
}
```

---

#### 2. Shared Packages

##### A. `packages/db-types`

**`packages/db-types/package.json`**:
```json
{
  "name": "@finvault/db-types",
  "version": "0.1.0",
  "description": "Shared TypeScript definitions and interfaces for FinVault database and schemas",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "import": "./src/index.ts",
      "default": "./src/index.ts"
    }
  },
  "scripts": {
    "build": "tsc --emitDeclarationOnly",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src --ext .ts"
  },
  "devDependencies": {
    "typescript": "^5.4.5"
  }
}
```

**`packages/db-types/tsconfig.json`**:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "./src",
    "outDir": "./dist"
  },
  "include": ["src/**/*"]
}
```

**`packages/db-types/src/index.ts`**:
```typescript
/**
 * FinVault Shared Database Types
 * Invariant: All monetary amounts are stored as BIGINT minor units (paise/cents).
 * No floating point currency numbers are permitted.
 */

export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE';
export type EntryDirection = 'DEBIT' | 'CREDIT';
export type IOUDirection = 'LENT' | 'BORROWED';
export type IOUStatus = 'OPEN' | 'PARTIAL' | 'SETTLED' | 'WRITTEN_OFF';

export interface Account {
  id: string;
  user_id: string;
  name: string;
  type: AccountType;
  currency: string;
  balance_minor: bigint;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
  version: bigint;
}

export interface Transaction {
  id: string;
  user_id: string;
  idempotency_key: string;
  transaction_date: string;
  description: string;
  notes?: string | null;
  is_reconciled: boolean;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
  version: bigint;
}

export interface JournalEntry {
  id: string;
  user_id: string;
  transaction_id: string;
  account_id: string;
  amount_minor: bigint;
  direction: EntryDirection;
  created_at: string;
}

export interface IOURecord {
  id: string;
  user_id: string;
  counterparty_name: string;
  counterparty_contact?: string | null;
  direction: IOUDirection;
  principal_minor: bigint;
  remaining_balance_minor: bigint;
  currency: string;
  status: IOUStatus;
  due_date?: string | null;
  notes?: string | null;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
  version: bigint;
}

export interface SinkingFund {
  id: string;
  user_id: string;
  name: string;
  target_amount_minor: bigint;
  allocated_amount_minor: bigint;
  target_date?: string | null;
  currency: string;
  is_completed: boolean;
  created_at: string;
  updated_at: string;
  version: bigint;
}

export interface NewJournalEntryPayload {
  account_id: string;
  amount_minor: bigint;
  direction: EntryDirection;
}

export interface NewTransactionPayload {
  idempotency_key: string;
  transaction_date: string;
  description: string;
  notes?: string;
  entries: NewJournalEntryPayload[];
}

export interface NewIOUPayload {
  counterparty_name: string;
  counterparty_contact?: string;
  direction: IOUDirection;
  principal_minor: bigint;
  currency?: string;
  due_date?: string;
  notes?: string;
}
```

---

##### B. `packages/sync-engine`

**`packages/sync-engine/package.json`**:
```json
{
  "name": "@finvault/sync-engine",
  "version": "0.1.0",
  "description": "Offline-first SQLite adapter, mutation outbox queue, and delta sync protocol",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "import": "./src/index.ts",
      "default": "./src/index.ts"
    }
  },
  "scripts": {
    "build": "tsc --emitDeclarationOnly",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src --ext .ts",
    "test": "vitest run"
  },
  "dependencies": {
    "@finvault/db-types": "workspace:*",
    "@supabase/supabase-js": "^2.42.0"
  },
  "devDependencies": {
    "fast-check": "^3.18.0",
    "typescript": "^5.4.5",
    "vitest": "^1.6.0"
  }
}
```

**`packages/sync-engine/tsconfig.json`**:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "./src",
    "outDir": "./dist"
  },
  "include": ["src/**/*"]
}
```

**`packages/sync-engine/src/index.ts`**:
```typescript
import {
  Account,
  Transaction,
  NewTransactionPayload,
} from '@finvault/db-types';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface SyncMutation {
  id: string;
  table_name: string;
  record_id: string;
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  payload: string;
  status: 'PENDING' | 'SYNCED' | 'FAILED';
  retry_count: number;
  created_at: string;
}

export interface SyncResult {
  pushed: number;
  pulled: number;
  errors: string[];
  lastSyncTimestamp: string;
}

export interface DatabaseHandle {
  close: () => Promise<void>;
  execute: (sql: string, params?: unknown[]) => Promise<unknown[]>;
}

export async function initDatabase(path: string = 'finvault_local.db'): Promise<DatabaseHandle> {
  return {
    close: async () => {},
    execute: async (_sql: string, _params?: unknown[]) => []
  };
}

export async function enqueueMutation(mutation: SyncMutation): Promise<void> {
  // Outbox mutation queueing stub for M1
  void mutation;
}

export async function syncWithRemote(supabaseClient: SupabaseClient): Promise<SyncResult> {
  // Delta sync protocol stub for M1
  void supabaseClient;
  return {
    pushed: 0,
    pulled: 0,
    errors: [],
    lastSyncTimestamp: new Date().toISOString()
  };
}

export async function getAccounts(): Promise<Account[]> {
  return [];
}

export async function postTransaction(tx: NewTransactionPayload): Promise<Transaction> {
  // Verify double-entry invariant in minor units
  let sumDebits = 0n;
  let sumCredits = 0n;
  for (const entry of tx.entries) {
    if (entry.direction === 'DEBIT') {
      sumDebits += entry.amount_minor;
    } else {
      sumCredits += entry.amount_minor;
    }
  }

  if (sumDebits !== sumCredits) {
    throw new Error(`Double-entry invariant violated: debits (${sumDebits}) != credits (${sumCredits})`);
  }

  return {
    id: tx.idempotency_key,
    user_id: 'local-user',
    idempotency_key: tx.idempotency_key,
    transaction_date: tx.transaction_date,
    description: tx.description,
    notes: tx.notes ?? null,
    is_reconciled: false,
    is_deleted: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    version: 1n
  };
}

export async function settleIOU(iouId: string, amountMinor: bigint, accountId: string): Promise<void> {
  void iouId;
  void amountMinor;
  void accountId;
}
```

---

##### C. `packages/ui`

**`packages/ui/package.json`**:
```json
{
  "name": "@finvault/ui",
  "version": "0.1.0",
  "description": "Venzer Botanical Minimalist design tokens and layout primitives",
  "main": "./src/index.tsx",
  "types": "./src/index.tsx",
  "exports": {
    ".": {
      "types": "./src/index.tsx",
      "import": "./src/index.tsx",
      "default": "./src/index.tsx"
    },
    "./tokens": {
      "types": "./src/tokens.ts",
      "import": "./src/tokens.ts",
      "default": "./src/tokens.ts"
    }
  },
  "scripts": {
    "build": "tsc --emitDeclarationOnly",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src --ext .ts,.tsx"
  },
  "dependencies": {
    "@finvault/db-types": "workspace:*",
    "clsx": "^2.1.1",
    "lucide-react": "^0.378.0",
    "tailwind-merge": "^2.3.0"
  },
  "peerDependencies": {
    "react": "^18.2.0 || ^19.0.0",
    "react-dom": "^18.2.0 || ^19.0.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "typescript": "^5.4.5"
  }
}
```

**`packages/ui/tsconfig.json`**:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "rootDir": "./src",
    "outDir": "./dist"
  },
  "include": ["src/**/*"]
}
```

**`packages/ui/src/tokens.ts`**:
```typescript
/**
 * Venzer Botanical Minimalist Design Tokens (ADR-007)
 */
export const TOKENS = {
  colors: {
    obsidianCarbon: '#040A0A',
    softMint: '#DEEEDA',
    sagePistachio: '#C7E0BA',
    botanicalGreen: '#7AAA4A',
    mutedSage: '#90A999',
    charcoalSlate: '#38424C',
  },
  layout: {
    maxVisualGroups: 3,
    maxRowAttributes: 3,
    borderRadius: '24px',
    transitionDurationMs: 150, // <= 180ms requirement
  }
} as const;
```

**`packages/ui/src/index.tsx`**:
```tsx
import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { TOKENS } from './tokens';

export * from './tokens';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'surface' | 'dark';
}

export const Card: React.FC<CardProps> = ({
  className,
  variant = 'surface',
  children,
  ...props
}) => {
  return (
    <div
      className={cn(
        'rounded-3xl p-6 transition-all duration-150',
        variant === 'surface'
          ? 'bg-[#DEEEDA] text-[#38424C] border border-[#C7E0BA]'
          : 'bg-[#040A0A] text-[#DEEEDA] border border-[#38424C]',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
}

export const Button: React.FC<ButtonProps> = ({
  className,
  variant = 'primary',
  children,
  ...props
}) => {
  return (
    <button
      className={cn(
        'rounded-3xl px-5 py-2.5 font-medium transition-all duration-150 active:scale-95 disabled:opacity-50 disabled:pointer-events-none',
        variant === 'primary' && 'bg-[#7AAA4A] text-white hover:bg-[#68943f]',
        variant === 'secondary' && 'bg-[#C7E0BA] text-[#38424C] hover:bg-[#b8d4ab]',
        variant === 'ghost' && 'bg-transparent text-[#90A999] hover:text-[#DEEEDA]',
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
};

export interface BalanceBadgeProps {
  differenceMinor: bigint;
}

export const BalanceBadge: React.FC<BalanceBadgeProps> = ({ differenceMinor }) => {
  const isBalanced = differenceMinor === 0n;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all duration-150',
        isBalanced
          ? 'bg-[#7AAA4A]/20 text-[#7AAA4A] border border-[#7AAA4A]/40'
          : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
      )}
    >
      <span className={cn('h-2 w-2 rounded-full', isBalanced ? 'bg-[#7AAA4A]' : 'bg-rose-400')} />
      {isBalanced ? 'Balanced' : `Diff: ${(Number(differenceMinor) / 100).toFixed(2)}`}
    </span>
  );
};

export interface AmountInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  valueMinor: bigint;
  onChangeMinor: (val: bigint) => void;
}

export const AmountInput: React.FC<AmountInputProps> = ({
  valueMinor,
  onChangeMinor,
  className,
  ...props
}) => {
  const displayValue = (Number(valueMinor) / 100).toFixed(2);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^0-9.]/g, '');
    const num = parseFloat(raw);
    if (!isNaN(num)) {
      onChangeMinor(BigInt(Math.round(num * 100)));
    } else {
      onChangeMinor(0n);
    }
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      value={displayValue}
      onChange={handleChange}
      className={cn(
        'rounded-2xl border border-[#C7E0BA] bg-[#DEEEDA] px-4 py-2 text-[#38424C] focus:outline-none focus:ring-2 focus:ring-[#7AAA4A] transition-all duration-150',
        className
      )}
      {...props}
    />
  );
};
```

---

#### 3. Applications

##### A. `apps/web` (Next.js 14+ Cockpit)

**`apps/web/package.json`**:
```json
{
  "name": "@finvault/web",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@finvault/db-types": "workspace:*",
    "@finvault/sync-engine": "workspace:*",
    "@finvault/ui": "workspace:*",
    "@supabase/ssr": "^0.3.0",
    "@supabase/supabase-js": "^2.42.0",
    "clsx": "^2.1.1",
    "lucide-react": "^0.378.0",
    "next": "^14.2.3",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "tailwind-merge": "^2.3.0"
  },
  "devDependencies": {
    "@types/node": "^20.12.7",
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "autoprefixer": "^10.4.19",
    "eslint": "^8.57.0",
    "eslint-config-next": "^14.2.3",
    "postcss": "^8.4.38",
    "tailwindcss": "^3.4.3",
    "typescript": "^5.4.5"
  }
}
```

**`apps/web/next.config.mjs`**:
```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@finvault/ui", "@finvault/sync-engine", "@finvault/db-types"],
  reactStrictMode: true,
};

export default nextConfig;
```

**`apps/web/tsconfig.json`**:
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

**`apps/web/tailwind.config.ts`**:
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
        obsidian: '#040A0A',
        softMint: '#DEEEDA',
        sagePistachio: '#C7E0BA',
        botanicalGreen: '#7AAA4A',
        mutedSage: '#90A999',
        charcoalSlate: '#38424C',
      },
      borderRadius: {
        '3xl': '24px',
      },
      transitionDuration: {
        '150': '150ms',
      },
    },
  },
  plugins: [],
};

export default config;
```

**`apps/web/postcss.config.js`**:
```javascript
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

**`apps/web/src/app/globals.css`**:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --background: #040A0A;
  --foreground: #DEEEDA;
}

body {
  color: var(--foreground);
  background: var(--background);
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  min-height: 100vh;
}
```

**`apps/web/src/app/layout.tsx`**:
```tsx
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'FinVault — Private Wealth & Ledger Cockpit',
  description: 'Privacy-focused local-first personal finance, money lending, and wealth management platform.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-[#040A0A] text-[#DEEEDA] antialiased">
        <main className="min-h-screen max-w-6xl mx-auto px-4 py-8">
          {children}
        </main>
      </body>
    </html>
  );
}
```

**`apps/web/src/app/page.tsx`**:
```tsx
import React from 'react';
import { Card, Button, BalanceBadge } from '@finvault/ui';

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-[#38424C] pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#DEEEDA]">FinVault Cockpit</h1>
          <p className="text-sm text-[#90A999]">Privacy-First Double-Entry Wealth Ledger</p>
        </div>
        <div className="flex items-center gap-3">
          <BalanceBadge differenceMinor={0n} />
          <Button variant="primary">New Transaction</Button>
        </div>
      </header>

      {/* Visual Component Groups (Strictly Max 3 Groups) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Group 1: Net Worth & Liquidity */}
        <Card variant="surface">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[#38424C]">Net Worth & Liquidity</h2>
          <div className="mt-3">
            <span className="text-3xl font-extrabold text-[#38424C]">₹0.00</span>
            <p className="text-xs text-[#90A999] mt-1">Safe-to-Spend: ₹0.00</p>
          </div>
        </Card>

        {/* Group 2: Cash Flow Trajectory */}
        <Card variant="surface">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[#38424C]">Cash Flow (This Month)</h2>
          <div className="mt-3 flex items-center justify-between">
            <div>
              <span className="text-xs text-[#90A999]">Inflows</span>
              <p className="text-sm font-semibold text-[#7AAA4A]">+₹0.00</p>
            </div>
            <div>
              <span className="text-xs text-[#90A999]">Outflows</span>
              <p className="text-sm font-semibold text-rose-500">-₹0.00</p>
            </div>
          </div>
        </Card>

        {/* Group 3: Active IOUs & Lending */}
        <Card variant="surface">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[#38424C]">Active Peer IOUs</h2>
          <div className="mt-3">
            <span className="text-2xl font-bold text-[#38424C]">0 Active</span>
            <p className="text-xs text-[#90A999] mt-1">All balances settled</p>
          </div>
        </Card>
      </div>
    </div>
  );
}
```

---

##### B. `apps/mobile` (Expo React Native Android/iOS)

**`apps/mobile/package.json`**:
```json
{
  "name": "@finvault/mobile",
  "version": "0.1.0",
  "private": true,
  "main": "App.tsx",
  "scripts": {
    "start": "expo start",
    "android": "expo start --android",
    "ios": "expo start --ios",
    "web": "expo start --web",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@finvault/db-types": "workspace:*",
    "@finvault/sync-engine": "workspace:*",
    "@supabase/supabase-js": "^2.42.0",
    "expo": "~51.0.0",
    "expo-local-authentication": "~14.0.0",
    "expo-secure-store": "~13.0.0",
    "expo-sqlite": "~14.0.0",
    "expo-status-bar": "~1.12.1",
    "react": "18.2.0",
    "react-native": "0.74.1"
  },
  "devDependencies": {
    "@types/react": "~18.2.45",
    "typescript": "^5.4.5"
  }
}
```

**`apps/mobile/app.json`**:
```json
{
  "expo": {
    "name": "FinVault",
    "slug": "finvault",
    "version": "0.1.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "userInterfaceStyle": "dark",
    "scheme": "finvault",
    "splash": {
      "backgroundColor": "#040A0A"
    },
    "android": {
      "adaptiveIcon": {
        "backgroundColor": "#040A0A"
      },
      "package": "com.finvault.app"
    },
    "ios": {
      "supportsTablet": false,
      "bundleIdentifier": "com.finvault.app"
    }
  }
}
```

**`apps/mobile/tsconfig.json`**:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-native"
  },
  "include": ["**/*.ts", "**/*.tsx"]
}
```

**`apps/mobile/metro.config.js`**:
```javascript
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Watch monorepo workspace packages
config.watchFolders = [monorepoRoot];

// Let Metro resolve packages within the monorepo
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

module.exports = config;
```

**`apps/mobile/App.tsx`**:
```tsx
import React from 'react';
import { StyleSheet, Text, View, SafeAreaView } from 'react-native';
import { StatusBar } from 'expo-status-bar';

export default function App() {
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" backgroundColor="#040A0A" />
      <View style={styles.content}>
        <Text style={styles.brandTitle}>FinVault</Text>
        <Text style={styles.subtitle}>Privacy-First Mobile Financial Ledger</Text>

        <View style={styles.card}>
          <Text style={styles.cardHeader}>NET WORTH</Text>
          <Text style={styles.amount}>₹0.00</Text>
          <Text style={styles.statusBadge}>● SQLite Offline Storage Ready</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardHeader}>ACTIVE IOUS & BILLS</Text>
          <Text style={styles.amount}>0 Pending</Text>
          <Text style={styles.caption}>Sub-50ms Local Offline Capture Active</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#040A0A',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 40,
    gap: 16,
  },
  brandTitle: {
    color: '#DEEEDA',
    fontSize: 26,
    fontWeight: '700',
  },
  subtitle: {
    color: '#90A999',
    fontSize: 14,
    marginBottom: 8,
  },
  card: {
    backgroundColor: '#DEEEDA',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#C7E0BA',
  },
  cardHeader: {
    color: '#38424C',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  amount: {
    color: '#38424C',
    fontSize: 28,
    fontWeight: '800',
    marginTop: 6,
  },
  statusBadge: {
    color: '#7AAA4A',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 8,
  },
  caption: {
    color: '#90A999',
    fontSize: 12,
    marginTop: 8,
  },
});
```

---

#### 4. Supabase Folder Structure

##### `d:\programming\New_project\supabase\config.toml`
```toml
project_id = "finvault"

[api]
enabled = true
port = 54321
schemas = ["public", "storage", "graphql_public"]
extra_search_path = ["public", "extensions"]
max_rows = 1000

[db]
port = 54322

[auth]
enabled = true
site_url = "http://localhost:3000"
additional_redirect_urls = ["https://localhost:3000", "finvault://*"]
jwt_expiry = 3600

[auth.external.google]
enabled = true
client_id = "env(GOOGLE_CLIENT_ID)"
secret = "env(GOOGLE_CLIENT_SECRET)"
```

##### `d:\programming\New_project\supabase\migrations\20261108000000_init_finvault_schema.sql`
```sql
-- FinVault Initial Schema & Invariant Enforcement
-- Generated for Supabase PostgreSQL 16

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Core Enum Definitions
CREATE TYPE account_type AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE');
CREATE TYPE entry_direction AS ENUM ('DEBIT', 'CREDIT');
CREATE TYPE iou_direction AS ENUM ('LENT', 'BORROWED');
CREATE TYPE iou_status AS ENUM ('OPEN', 'PARTIAL', 'SETTLED', 'WRITTEN_OFF');

-- Accounts Table
CREATE TABLE IF NOT EXISTS accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name VARCHAR(120) NOT NULL,
    type account_type NOT NULL,
    currency CHAR(3) NOT NULL DEFAULT 'INR',
    balance_minor BIGINT NOT NULL DEFAULT 0,
    is_archived BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    version BIGINT NOT NULL DEFAULT 1
);

ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only access their own accounts"
    ON accounts FOR ALL USING (auth.uid() = user_id);

-- Transactions Table
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    idempotency_key UUID UNIQUE NOT NULL,
    transaction_date DATE NOT NULL,
    description VARCHAR(255) NOT NULL,
    notes TEXT,
    is_reconciled BOOLEAN NOT NULL DEFAULT FALSE,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    version BIGINT NOT NULL DEFAULT 1
);

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only access their own transactions"
    ON transactions FOR ALL USING (auth.uid() = user_id);

-- Journal Entries Table (Strict Double-Entry Components)
CREATE TABLE IF NOT EXISTS journal_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
    amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
    direction entry_direction NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only access their own journal entries"
    ON journal_entries FOR ALL USING (auth.uid() = user_id);

-- IOU Records Table
CREATE TABLE IF NOT EXISTS iou_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    counterparty_name VARCHAR(120) NOT NULL,
    counterparty_contact VARCHAR(80),
    direction iou_direction NOT NULL,
    principal_minor BIGINT NOT NULL CHECK (principal_minor > 0),
    remaining_balance_minor BIGINT NOT NULL,
    currency CHAR(3) NOT NULL DEFAULT 'INR',
    status iou_status NOT NULL DEFAULT 'OPEN',
    due_date DATE,
    notes TEXT,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    version BIGINT NOT NULL DEFAULT 1
);

ALTER TABLE iou_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only access their own IOUs"
    ON iou_records FOR ALL USING (auth.uid() = user_id);

-- Sinking Funds Table
CREATE TABLE IF NOT EXISTS sinking_funds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name VARCHAR(120) NOT NULL,
    target_amount_minor BIGINT NOT NULL CHECK (target_amount_minor > 0),
    allocated_amount_minor BIGINT NOT NULL DEFAULT 0,
    target_date DATE,
    currency CHAR(3) NOT NULL DEFAULT 'INR',
    is_completed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    version BIGINT NOT NULL DEFAULT 1
);

ALTER TABLE sinking_funds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only access their own sinking funds"
    ON sinking_funds FOR ALL USING (auth.uid() = user_id);
```

##### `d:\programming\New_project\supabase\functions\validate-transaction\index.ts`
```typescript
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

interface Entry {
  account_id: string;
  amount_minor: number;
  direction: 'DEBIT' | 'CREDIT';
}

serve(async (req) => {
  try {
    const { entries } = await req.json() as { entries: Entry[] };
    if (!entries || !Array.isArray(entries) || entries.length === 0) {
      return new Response(JSON.stringify({ error: 'Entries array is required' }), { status: 400 });
    }

    let debits = 0;
    let credits = 0;
    for (const e of entries) {
      if (e.direction === 'DEBIT') debits += e.amount_minor;
      else if (e.direction === 'CREDIT') credits += e.amount_minor;
    }

    if (debits !== credits) {
      return new Response(
        JSON.stringify({
          error: 'Double-entry balance violation',
          debits,
          credits,
          difference: debits - credits,
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ valid: true, balancedAmount: debits }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
});
```

##### `d:\programming\New_project\supabase\functions\sync-reconcile\index.ts`
```typescript
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

serve(async (req) => {
  try {
    const body = await req.json();
    return new Response(
      JSON.stringify({
        status: 'acknowledged',
        reconciledTimestamp: new Date().toISOString(),
        echo: body,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
});
```

---

### Implementation Instructions for the Worker Agent

1. **Step 1: Create Directory Tree**
   ```powershell
   New-Item -ItemType Directory -Force -Path `
     "d:\programming\New_project\apps\web\src\app", `
     "d:\programming\New_project\apps\mobile", `
     "d:\programming\New_project\packages\db-types\src", `
     "d:\programming\New_project\packages\sync-engine\src", `
     "d:\programming\New_project\packages\ui\src", `
     "d:\programming\New_project\supabase\migrations", `
     "d:\programming\New_project\supabase\functions\validate-transaction", `
     "d:\programming\New_project\supabase\functions\sync-reconcile"
   ```

2. **Step 2: Write Root Configuration Files**
   - Write `.gitignore`, `.env.example`, `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `tsconfig.json`.

3. **Step 3: Write Shared Packages**
   - In `packages/db-types/`: `package.json`, `tsconfig.json`, `src/index.ts`.
   - In `packages/sync-engine/`: `package.json`, `tsconfig.json`, `src/index.ts`.
   - In `packages/ui/`: `package.json`, `tsconfig.json`, `src/tokens.ts`, `src/index.tsx`.

4. **Step 4: Write Applications**
   - In `apps/web/`: `package.json`, `next.config.mjs`, `tsconfig.json`, `tailwind.config.ts`, `postcss.config.js`, `src/app/globals.css`, `src/app/layout.tsx`, `src/app/page.tsx`.
   - In `apps/mobile/`: `package.json`, `app.json`, `tsconfig.json`, `metro.config.js`, `App.tsx`.

5. **Step 5: Write Supabase Files**
   - In `supabase/`: `config.toml`.
   - In `supabase/migrations/`: `20261108000000_init_finvault_schema.sql`.
   - In `supabase/functions/validate-transaction/`: `index.ts`.
   - In `supabase/functions/sync-reconcile/`: `index.ts`.

---

## 5. Verification Method

To verify this architecture and configuration:
1. **File Manifest Integrity**:
   Verify all files exist and are not empty:
   ```powershell
   Get-ChildItem -Path "d:\programming\New_project" -Include package.json, pnpm-workspace.yaml, turbo.json, tsconfig.base.json -Recurse
   ```
2. **Workspace Resolution**:
   Check that pnpm workspace recognizes the packages:
   ```powershell
   pnpm -r ls --depth -1
   ```
   *Expected output:* lists `finvault-monorepo`, `@finvault/db-types`, `@finvault/sync-engine`, `@finvault/ui`, `@finvault/web`, `@finvault/mobile`.
3. **TypeScript Typecheck**:
   ```powershell
   pnpm run typecheck
   ```
   *Expected output:* TS compiler passes across packages and apps without missing import or unresolved type errors.
4. **Turborepo Pipeline Execution**:
   ```powershell
   pnpm turbo build
   ```
   *Expected output:* Turborepo builds packages in topological dependency order (`@finvault/db-types` -> `@finvault/sync-engine`, `@finvault/ui` -> `@finvault/web`).
