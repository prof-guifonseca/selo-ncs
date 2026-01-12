/**
 * Minimal Node.js shims for projects that typecheck JavaScript using
 * TypeScript without installing @types/node.  These declarations are
 * deliberately broad and permissive: each module is declared as `any`
 * so that existing runtime code continues to compile under --checkJs.
 *
 * When running in environments where @types/node is available (for
 * example after adding it as a devDependency), these ambient
 * declarations will be superseded by the more accurate types and may
 * safely be removed.  In the meantime they prevent the compiler from
 * emitting `Cannot find module` errors for built‑in Node modules and
 * globals such as Buffer and process.
 */

declare module 'crypto';
declare module 'path';
declare module 'fs';
declare module 'url';
declare module 'http';
declare module 'https';
declare module 'querystring';
declare module 'util';
declare module 'stream';
declare module 'zlib';
declare module 'events';
declare module 'assert';
declare module 'os';
declare module 'tty';
declare module 'net';

/**
 * Declare commonly used Node globals as `any` to avoid missing name
 * errors.  These can be refined or removed once proper typings are
 * installed.
 */
declare var Buffer: any;
declare var process: any;