// no-op stub for the "server-only" package under vitest — it's purely a
// bundler-time guard (throws when imported from a Client Component build),
// which is meaningless in a plain Node test runner and would otherwise
// break every test file that transitively imports a "use server"-guarded
// module (e.g. session-token.ts).
export {};
