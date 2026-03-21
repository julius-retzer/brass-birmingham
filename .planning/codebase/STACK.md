# Technology Stack

**Analysis Date:** 2026-03-21

## Languages

**Primary:**
- TypeScript 5.5.3 - All application code, strict mode enabled

**Secondary:**
- JavaScript (ES2022) - Configuration files only

## Runtime

**Environment:**
- Node.js 20+ (inferred from @types/node 20.14.10)

**Package Manager:**
- pnpm 10.4.1
- Lockfile: pnpm-lock.yaml (present, not committed)

## Frameworks

**Core:**
- Next.js 15.4.6 - React metaframework with App Router and Server Components
- React 18.3.1 - UI component library
- React DOM 18.3.1 - DOM rendering

**State Management:**
- XState 5.19.2 - State machine library for complex game logic
- @xstate/react 5.0.2 - React hooks integration for XState machines
- @statelyai/inspect 0.4.0 - State machine visualization and debugging

**UI Components:**
- Shadcn UI 0.9.4 - New York style variant with stone base color
- Radix UI (full suite) - Primitives and accessible components
  - @radix-ui/react-accordion 1.2.3
  - @radix-ui/react-alert-dialog 1.1.6
  - @radix-ui/react-checkbox 1.1.4
  - @radix-ui/react-dialog 1.1.6
  - @radix-ui/react-dropdown-menu 2.1.6
  - @radix-ui/react-label 2.1.2
  - @radix-ui/react-navigation-menu 1.2.5
  - @radix-ui/react-popover 1.1.6
  - @radix-ui/react-progress 1.1.2
  - @radix-ui/react-radio-group 1.2.3
  - @radix-ui/react-scroll-area 1.2.3
  - @radix-ui/react-select 2.1.6
  - @radix-ui/react-slider 1.2.3
  - @radix-ui/react-tabs 1.1.3
  - @radix-ui/react-toggle 1.1.2
  - @radix-ui/react-toggle-group 1.1.2
  - @radix-ui/react-tooltip 1.1.8

**Styling & Layout:**
- Tailwind CSS 3.4.3 - Utility-first CSS framework
- tailwindcss-animate 1.0.7 - Animation utilities for Tailwind
- tailwind-merge 3.0.1 - Merge utility classes without conflicts
- PostCSS 8.4.39 - CSS transformation pipeline
- prettier-plugin-tailwindcss 0.6.5 - Tailwind class sorting
- Geist 1.3.0 - Typography and design system

**Visualization:**
- @xyflow/react 12.4.3 - Graph/network visualization
- Recharts 2.15.1 - React charting library
- Lucide React 0.475.0 - Icon library
- React Icons 5.5.0 - Alternative icon library
- Embla Carousel React 8.5.2 - Carousel component

**Forms & Input:**
- React Hook Form 7.54.2 - Form state management
- @hookform/resolvers 4.1.1 - Validation resolvers for Hook Form
- Zod 3.24.2 - TypeScript schema validation
- input-otp 1.4.2 - OTP input component
- Cmdk 1.0.0 - Command/search component

**UI Utilities:**
- Class Variance Authority 0.7.1 - Component variant generation
- clsx 2.1.1 - Conditional classname utility
- Vaul 1.1.2 - Drawer component
- react-day-picker 8.10.1 - Date picker
- react-resizable-panels 2.1.7 - Resizable panel layout

**Notifications:**
- sonner 2.0.1 - Toast notification library

**Theming:**
- next-themes 0.4.4 - Dark mode and theme management

## Testing

**Framework:**
- Vitest 3.0.6 - Unit and integration test runner
- Config: `vitest.config.ts`

**Test Commands:**
```bash
pnpm test              # Run gameStore tests only
pnpm test:watch       # Watch mode for gameStore tests
pnpm test:all         # Run all tests
pnpm test:coverage    # Generate coverage report
pnpm test:v2          # Run v2 store tests
```

## Database

**ORM:**
- Drizzle ORM 0.44.4 - TypeScript ORM with PostgreSQL support
- drizzle-kit 0.31.4 - Migration and schema management

**Database Client:**
- @neondatabase/serverless 1.0.1 - Serverless PostgreSQL driver for Neon DB
- Fallback: @libsql/client 0.9.0 (commented out, for Turso SQLite support)

**Schema:**
- PostgreSQL with Drizzle
- Location: `src/server/db/schema.ts`
- Tables: games (state, players, metadata)

## Build & Dev Tools

**Linting:**
- Biome 1.9.4 - Linter and formatter
- Config: `biome.json`
- ESLint 8.57.0 - JavaScript/TypeScript linting
- @typescript-eslint/eslint-plugin 8.1.0
- @typescript-eslint/parser 8.1.0
- eslint-plugin-drizzle 0.2.3 - Drizzle ORM linting

**Formatting:**
- Prettier 3.3.2 - Code formatter
- Configured via Biome

**Type Checking:**
- TypeScript 5.5.3 (strict mode)
- tsc --noEmit for type verification

**Build System:**
- Next.js 15 built-in build system with Turbo
- Turbo for monorepo/build optimization

## Configuration

**Environment:**
- @t3-oss/env-nextjs 0.10.1 - Type-safe environment variable validation
- `.env` file (git-ignored) - Runtime configuration
- Schema defined in `src/env.js`

**Required Variables:**
- `DATABASE_URL` (server-side) - PostgreSQL connection string for Drizzle ORM
- `NODE_ENV` (server-side) - development/test/production
- No public/client-side environment variables configured

**Build Configuration:**
- `next.config.js` - Empty (minimal Next.js config)
- `tsconfig.json` - Strict TypeScript configuration
  - Target: ES2022
  - Module: ESNext
  - Path alias: `~/*` → `./src/*`
- `tailwind.config.ts` - Dark mode support, stone color base
- `components.json` - Shadcn UI configuration

## Platform Requirements

**Development:**
- Node.js 20+ (TypeScript types indicate minimum)
- pnpm 10.4.1 (optional but recommended)

**Production:**
- Node.js 20+ runtime
- PostgreSQL database (Neon DB recommended)
- Environment variable: DATABASE_URL pointing to PostgreSQL instance

---

*Stack analysis: 2026-03-21*
