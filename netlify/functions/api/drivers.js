// netlify/functions/api/drivers.js
//
// Drivers abstraction exposing RLS handlers for certain resources.  These
// exports allow tests or advanced integrations to bypass the main router
// and invoke specific implementations.  Baseline handlers have been
// removed.

'use strict';

const processes = require('./routes_processes.js');
// Auditor drivers removed. The auditor API is deprecated and no longer
// provides baseline or RLS handlers.
const evidences = require('./routes_evidences.js');

// Drivers exposing only RLS handlers.  Baseline exports have been removed.
module.exports = {
  handleProcesses: processes.handle,
  handleEvidences: evidences.handle,
};