/*
 * Front‑end typecheck entrypoint.
 *
 * This file imports the critical browser modules so that the TypeScript
 * compiler (invoked with allowJs + checkJs) will analyze those files when
 * running `npm run typecheck:front`.  Keep this list short and focused on
 * modules that form the backbone of the UI (router, actions, dashboards,
 * main entrypoints).  When introducing new high‑impact files, add them
 * here to ensure the type checker can catch regressions early.
 */

// NOTE: We intentionally do not import `src/main.js` in this entrypoint.  The
// bootstrap file currently pulls in all dashboards and action handlers,
// which leads to a large number of type errors unrelated to the core
// application surface.  By limiting the scope here we can progressively
// adopt stricter type checking without being overwhelmed.  See
// docs/dev/JSDOC_AUDIT.md for context.

// Import a minimal set of critical front‑end modules.  These modules form
// the backbone of routing, branding and session management.  When adding
// new high‑impact files to the application, import them here so that
// TypeScript analyses their JSDoc types.  Avoid importing modules with
// known widespread issues until their type signatures have been refined.

// Client‑side router and navigation helpers.
import '../src/router.js';

// Brand customisation and configuration utilities.
import '../src/brand.js';

// Application state primitives.  Provides reactive stores used by the
// router and other modules.  Importing this ensures type safety around
// session persistence and role resolution.
import '../src/state.js';

// Navbar UI helpers.  This module touches DOM APIs and global flags; it
// benefits from type declarations on HTMLElement extensions.
import '../src/navbar.js';

// Shared UI helper functions.  These provide core DOM utilities and
// sanitisation helpers used across the application.  Importing this
// ensures any changes to shared UI helpers surface type errors early.
import '../src/shared/ui.js';

// Shared UI building blocks.  These helpers produce consistent HTML
// fragments for dashboards and reports.  Including them in the typecheck
// entrypoint protects the white‑label core from silent regressions.
import '../src/shared/blocks.js';