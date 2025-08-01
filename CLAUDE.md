# CLAUDE.md

Look at ai-docs for more guidelines and examples.

MOST IMPORTANT IS TO HAVE ai-docs/brass-birmingham-rules.mdc ALWAYS IN YOUR MIND.

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Always apply TDD for the gameStore.ts First write test and then the implementation. The gameStore should have 100% unit test coverage.

## Project Overview

Digital implementation of the Brass Birmingham board game using Next.js 15, TypeScript, XState for game state management, and Tailwind CSS with Shadcn UI components.

## Development Commands

**Build & Development:**
- `pnpm dev` - Start development server with Turbo
- `pnpm build` - Production build
- `pnpm start` - Start production server
- `pnpm preview` - Build and start production server

**Testing:**
- `pnpm test` - Run tests for claudeMachine (Vitest)
- `pnpm test:watch` - Run tests in watch mode

**Code Quality:**
- `pnpm lint` - Run Biome linting
- `pnpm lint:fix` - Auto-fix linting issues with Biome
- `pnpm lint:check` - Check with Biome without fixing
- `pnpm typecheck` - TypeScript type checking
- `pnpm check` - Run both lint and typecheck

**Database (Drizzle ORM):**
- `pnpm db:generate` - Generate database migrations
- `pnpm db:migrate` - Run database migrations
- `pnpm db:push` - Push schema changes to database
- `pnpm db:studio` - Open Drizzle Studio

**Formatting:**
- `pnpm format:write` - Format files with Prettier
- `pnpm format:check` - Check formatting with Prettier

## Architecture

**State Management:**
- XState v5 state machines for complex game state (`src/store/claudeMachine.ts`)
- Game state includes players, rounds, eras (Canal/Rail), actions, industry tiles, and board locations
- State machine handles turn progression, action validation, and game phase transitions

**Game Structure:**
- Two-era board game: Canal Era → Rail Era
- Player actions: Build, Network, Develop, Sell, Loan, Scout, Pass
- Industry types: CottonMill, CoalMine, IronWorks, Manufacturer, Pottery, Brewery
- Game data stored in `src/data/` (board layout, cards, industry tiles)

**UI Components:**
- Shadcn UI with "new-york" style variant
- Radix UI primitives for accessibility
- Tailwind CSS with stone base color
- Path aliases: `~/components`, `~/lib`, `~/hooks`
- Component structure: main component + subcomponents + helpers + types

**Data Layer:**
- Drizzle ORM with SQLite database
- Database schema in `src/server/db/schema.ts` (mostly commented out template)
- Environment configuration with `@t3-oss/env-nextjs`

## Code Style

**TypeScript:**
- Functional components with interfaces (avoid classes and enums)
- Prefer interfaces over types
- Strict typing enforced by Biome

**Formatting (Biome):**
- Single quotes, semicolons as needed
- 2-space indentation, 80 character line width
- Trailing commas, arrow parentheses
- JSX double quotes

**File Organization:**
- Lowercase directories with dashes
- Descriptive variable names with auxiliary verbs
- Export main component, then subcomponents, helpers, types
- Favor React Server Components, minimize 'use client'

**Game-Specific Patterns:**
- Game state types defined in state machine file
- Industry and location data as constant objects
- Board connections as arrays of relationship objects
- Immutable state updates using XState assign actions


### Shadcn MCP Server
When a task requires building or modifying a user interface, you must use the tools available in the shadcn-ui MCP server.

#### Planning Rule
When planning a UI build using shadcn:

Discover Assets: First, use list_components() and list_blocks() to see all available assets in the MCP server.
Map Request to Assets: Analyze the user's request and map the required UI elements to the available components and blocks.
Prioritize Blocks: You should prioritize using blocks (get_block) wherever possible for common, complex UI patterns (e.g., login pages, calendars, dashboards). Blocks provide more structure and accelerate development. Use individual components (get_component) for smaller, more specific needs.

### #Implementation Rule
When implementing the UI:

Get a Demo First: Before using a component, you must call the get_component_demo(component_name) tool. This is critical for understanding how the component is used, its required props, and its structure.
Retrieve the Code:

For a single component, call get_component(component_name).
For a composite block, call get_block(block_name).


Implement Correctly: Integrate the retrieved code into the application, customizing it with the necessary props and logic to fulfill the user's request.

## Important Notes
- You have ai-docs/brass-birmingham-rules.mdc the rules, but you can search the web for clarifications, if needed