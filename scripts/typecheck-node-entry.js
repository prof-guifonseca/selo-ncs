/*
 * Backend typecheck entrypoint.
 *
 * This file imports a curated set of Netlify function modules so that the
 * TypeScript compiler will traverse them when running `npm run typecheck:node`.
 * Keeping the entrypoint limited to key router and helper modules avoids
 * overwhelming the type system with unrelated files.  To extend coverage,
 * add additional imports here instead of broadening tsconfig.node.json's
 * include patterns.  This maintains incremental and pragmatic adoption of
 * static checking across the backend.
 */

// Backend typecheck entrypoint
//
// To keep the scope of the Node typecheck manageable we import only
// selected backend helpers.  Importing the full API router pulls in all
// routes and currently surfaces a large number of unrelated type errors.
// By focusing on core utilities first we can incrementally improve type
// coverage.  Additional modules should be imported here once their
// signatures have been refined.

// Core helpers used by most Netlify functions.  Provides request
// normalization, header parsing and response helpers.  Keeping this
// module error‑free ensures that common utilities remain reliable.
import '../netlify/functions/api/core.js';