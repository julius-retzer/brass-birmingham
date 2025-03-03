# Brass Birmingham - CLAUDE.md

## Build/Test/Lint Commands
- Build: `pnpm build`
- Dev: `pnpm dev`
- Test: `pnpm test`
- Test single file: `pnpm test src/path/to/file.test.ts`
- Test watch mode: `pnpm test:watch`
- Lint: `pnpm lint`
- Lint fix: `pnpm lint:fix`
- Typecheck: `pnpm typecheck`

## Code Style Guidelines
- Functional components with TypeScript interfaces, avoid classes
- Use xState for game state management
- Naming: lowercase directories with dashes, descriptive variable names with auxiliary verbs
- TypeScript: prefer interfaces over types, avoid enums
- Style: single quotes, no semicolons, consistent 2-space indentation
- Directory structure: exported component, subcomponents, helpers, types
- UI: Shadcn UI, Radix UI, and Tailwind for styling
- Minimize 'use client', favor React Server Components
- Use descriptive file and component names that reflect their purpose
- This project is a digital implementation of the Brass Birmingham board game