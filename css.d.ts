// Global stylesheet side-effect imports (`import './globals.css'`).
//
// Next ships ambient types for '*.module.css' only, never plain '*.css'.
// TypeScript <=5 let an undeclared side-effect import pass silently; TS7
// rejects it with TS2882, so the stock Next pattern needs this declaration.
// The more specific '*.module.css' pattern in next/types/global.d.ts still
// wins for CSS modules.
declare module '*.css'
