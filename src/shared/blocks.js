/**
 * @file src/shared/blocks.js
 * @module shared/blocks
 *
 * UI building blocks for dashboards.  These helpers produce small
 * fragments of HTML as strings that can be concatenated into larger
 * templates.  Unlike imperative DOM manipulation these helpers ensure
 * consistent markup and class names across the codebase.
 *
 * ## Escaping strategy
 *
 * All text inputs passed into these helpers are escaped via
 * {@link escapeHtml} to prevent HTML injection, **except** when the
 * parameter name ends with `Html`.  Parameters suffixed with `Html`
 * (e.g. `bodyHtml`) are assumed to already contain safe HTML and are
 * inserted verbatim without additional escaping.  Do not pass
 * untrusted content into `Html` parameters.
 */

import { escapeHtml, attr } from './ui.js';

/**
 * Renders a section wrapper with a heading and body.  The outer
 * element defaults to `<section>` but can be customised via `opts.tag`.
 * Additional classes may be provided via `opts.className`.  The title
 * is always escaped; the body is assumed to be HTML and should be
 * pre‑escaped before passing here.
 *
 * @param {any} title The section heading. Nullish values produce an empty string.
 * @param {string} bodyHtml Pre‑escaped HTML for the body of the section.
 * @param {{ tag?: string, className?: string }} [opts]
 * @returns {string}
 */
export function renderSection(title, bodyHtml, opts = {}) {
  const tag = opts.tag || 'section';
  const className = opts.className ? ` ${escapeHtml(opts.className)}` : '';
  const heading = escapeHtml(title ?? '');
  const body = bodyHtml ?? '';
  return `<${tag} class="block-section${className}"><h3>${heading}</h3><div class="block-section-body">${body}</div></${tag}>`;
}

/**
 * Renders a simple key/value row.  The label is bolded and followed by
 * a colon by default.  The value will be escaped unless `opts.raw` is
 * truthy, in which case the value is inserted verbatim.  When the
 * value is nullish or an empty string, a dash (—) is used.
 *
 * @param {any} label The label to display. Nullish values become an empty string.
 * @param {any} value The corresponding value. When `opts.raw` is falsey the value is escaped.
 * @param {{ raw?: boolean }} [opts]
 * @returns {string}
 */
export function renderMetaRow(label, value, opts = {}) {
  const labelEsc = escapeHtml(label ?? '');
  let val;
  if (value == null || value === '') {
    val = '—';
  } else if (opts.raw) {
    val = String(value);
  } else {
    val = escapeHtml(String(value));
  }
  return `<p><strong>${labelEsc}:</strong> ${val}</p>`;
}

/**
 * Renders a chip element with an optional variant.  Chips are small
 * inline labels used throughout dashboards to denote status, stages or
 * dates.  The text is always escaped.  Variants map directly to a
 * modifier class on `.meta-chip`.  The default variant is `neutral`,
 * which produces no additional modifier class.
 *
 * @param {any} text The chip text. Nullish values produce an empty string.
 * @param {('neutral'|'ok'|'warn'|'bad')} [variant='neutral'] The visual variant of the chip.
 * @returns {string}
 */
export function renderChip(text, variant = 'neutral') {
  const txt = escapeHtml(text ?? '');
  const v = String(variant || 'neutral');
  const modifier = v && v !== 'neutral' ? ` meta-chip--${escapeHtml(v)}` : '';
  return `<span class="meta-chip${modifier}">${txt}</span>`;
}

/**
 * Renders a KPI card displaying a numeric value, a label and an
 * optional note.  All parameters are escaped.  A note allows callers
 * to convey additional context (e.g. units).  When omitted the note
 * span is not rendered.
 *
 * @param {any} label The KPI label.
 * @param {any} value The KPI value.
 * @param {any} [note] Optional supplementary note.
 * @returns {string}
 */
export function renderKpiCard(label, value, note) {
  const valueEsc = escapeHtml(value ?? '');
  const labelEsc = escapeHtml(label ?? '');
  let noteHtml = '';
  if (note != null && note !== '') {
    const noteEsc = escapeHtml(note);
    noteHtml = `<span class="kpi-note">${noteEsc}</span>`;
  }
  return `<div class="kpi-card"><span class="kpi-value">${valueEsc}</span><span class="kpi-label">${labelEsc}</span>${noteHtml}</div>`;
}

/**
 * Renders a generic card component. Cards are simple containers used
 * across dashboards to group related content. Titles and subtitles are
 * escaped by default to prevent HTML injection. The body and footer
 * accept pre‑escaped HTML via the `bodyHtml` and `footerHtml` options
 * and are inserted verbatim. When a `className` is provided it is
 * escaped and appended to the base class `card`.
 *
 * @param {{
 *   title?: any,
 *   subtitle?: any,
 *   bodyHtml?: string,
 *   footerHtml?: string,
 *   className?: string
 * }} [opts]
 * @returns {string}
 */
export function renderCard(opts = {}) {
  const titleEsc = escapeHtml(opts.title ?? '');
  const subtitleEsc = escapeHtml(opts.subtitle ?? '');
  const className = opts.className ? ` ${escapeHtml(opts.className)}` : '';
  const body = opts.bodyHtml ?? '';
  const footer = opts.footerHtml ?? '';
  let subtitleHtml = '';
  if (opts.subtitle != null && opts.subtitle !== '') {
    subtitleHtml = `<p class="card-subtitle">${subtitleEsc}</p>`;
  }
  let footerBlock = '';
  if (opts.footerHtml) {
    footerBlock = `<footer class="card-footer">${footer}</footer>`;
  }
  return `<div class="card${className}"><h3>${titleEsc}</h3>${subtitleHtml}<div class="card-body">${body}</div>${footerBlock}</div>`;
}

/**
 * Renders a collection of meta rows as a single table/container. Each
 * element in the `rows` array should be an object with a `label` and
 * `value` property.  The value will be escaped by the underlying
 * `renderMetaRow` helper unless the row includes a truthy `raw` flag,
 * in which case the value is inserted verbatim.  When an empty or
 * non‑array is provided, an empty string is returned.
 *
 * @param {{ label: any, value: any, raw?: boolean }[]} rows
 * @returns {string}
 */
export function renderMetaTable(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return '';
  const inner = rows
    .map((row) => {
      const { label, value, raw } = row || {};
      return renderMetaRow(label, value, { raw: !!raw });
    })
    .join('');
  return `<div class="meta-table">${inner}</div>`;
}

/**
 * Renders a KPI row consisting of a name, score and optional note.
 * Unlike {@link renderKpiCard}, rows are intended for lists or table
 * layouts where multiple KPIs appear horizontally. All text inputs
 * are escaped. When `note` is provided a span with the class
 * `kpi-note` is included.
 *
 * @param {any} name The KPI name/label.
 * @param {any} score The KPI value/score.
 * @param {any} [note] Optional supplementary note.
 * @returns {string}
 */
export function renderKpiRow(name, score, note) {
  const nameEsc = escapeHtml(name ?? '');
  const scoreEsc = escapeHtml(score ?? '');
  let noteHtml = '';
  if (note != null && note !== '') {
    const noteEsc = escapeHtml(note);
    noteHtml = `<span class="kpi-note">${noteEsc}</span>`;
  }
  return `<div class="kpi-row"><span class="kpi-name">${nameEsc}</span><span class="kpi-score">${scoreEsc}</span>${noteHtml}</div>`;
}

/**
 * Renders a standard empty state message. Use this when a list or
 * section has no content to display. Both `title` and `hint` are
 * escaped. When a hint is provided it is rendered on a new line with
 * the class `muted`. Without a hint only the title is rendered.
 *
 * @param {any} title The main message (e.g. "Sem itens").
 * @param {any} [hint] Additional explanatory text.
 * @returns {string}
 */
export function renderEmptyState(title, hint) {
  const titleEsc = escapeHtml(title ?? '');
  let hintHtml = '';
  if (hint != null && hint !== '') {
    const hintEsc = escapeHtml(hint);
    hintHtml = `<br><span class="muted">${hintEsc}</span>`;
  }
  return `<p class="empty-state"><strong>${titleEsc}</strong>${hintHtml}</p>`;
}

/**
 * Renders a standard pillar divider row for tables.  Pillar dividers are used
 * in several dashboards to separate ESG groupings.  The pillar code and
 * human‑friendly label are escaped.  The column span defaults to 4 but can
 * be overridden.  Do not pass untrusted HTML into the parameters.
 *
 * @param {any} pillar The ESG pillar code (e.g. 'E', 'S', 'G'). Nullish values become an empty string.
 * @param {any} label The pillar label. When omitted falls back to the pillar code.
 * @param {number} [colSpan=4] Number of columns the header should span.
 * @returns {string}
 */
export function renderPillarDivider(pillar, label, colSpan = 4) {
  const p = escapeHtml(pillar ?? '');
  const lbl = escapeHtml(label ?? pillar ?? '');
  const span = String(colSpan == null ? 4 : colSpan);
  return `<tr class="pillar-divider" data-pillar="${p}"><th scope="colgroup" colspan="${escapeHtml(span)}"><span class="pillar-badge pillar-${p}">${p}</span><span class="pillar-title">${lbl}</span></th></tr>`;
}

/**
 * Renders two stacked lines: a bold primary line and a muted secondary line.
 * This helper is used to display indicator names together with context such
 * as the associated pillar or additional metadata.  Both lines are escaped
 * independently.  When either value is nullish it becomes an empty string.
 *
 * @param {any} primary The main text to emphasise (bold).
 * @param {any} secondary Secondary text rendered with the 'muted' class.
 * @returns {string}
 */
export function renderStrongMuted(primary, secondary) {
  const primaryEsc = escapeHtml(primary ?? '');
  const secondaryEsc = escapeHtml(secondary ?? '');
  return `<div class="text-strong">${primaryEsc}</div><div class="muted">${secondaryEsc}</div>`;
}

/**
 * Renders a detail header used in dashboard detail views.  The title is
 * rendered in an <h2> and the subtitle is rendered in a muted <p>.  Both
 * values are escaped.  When no subtitle is provided the <p> element is
 * omitted entirely.  Use this helper to avoid repeating header markup
 * across renderers.
 *
 * @param {any} title The main heading text. Nullish values become empty.
 * @param {any} subtitle The subtitle text (e.g. stage and status). Optional.
 * @returns {string}
 */
export function renderDetailHeader(title, subtitle) {
  const titleEsc = escapeHtml(title ?? '');
  const hasSubtitle = subtitle != null && subtitle !== '';
  const subtitleEsc = escapeHtml(subtitle ?? '');
  const subtitleHtml = hasSubtitle ? `<p class="muted">${subtitleEsc}</p>` : '';
  return `<header class="detail-head"><h2>${titleEsc}</h2>${subtitleHtml}</header>`;
}

/**
 * Renders a single button element.  The button is always given a
 * type="button" attribute by default but this can be overridden via
 * opts.type.  The label text is escaped.  Known options include:
 *  - className: CSS classes applied to the button
 *  - action: value for data-action attribute
 *  - id: value for data-id attribute
 *  - dataset: an object of additional data attributes (camelCase keys will
 *    be converted to kebab-case)
 *  - title: tooltip text on hover
 *  - disabled: boolean to mark the button as disabled
 *  - attrs: arbitrary extra attributes (name -> value)
 *
 * All attribute values are escaped.  Attributes with nullish or empty
 * values are omitted.
 *
 * @param {any} label The button text. Nullish values become an empty string.
 * @param {{
 *   type?: string,
 *   className?: string,
 *   action?: any,
 *   id?: any,
 *   dataset?: Record<string, any>,
 *   title?: any,
 *   disabled?: boolean,
 *   attrs?: Record<string, any>
 * }} [opts]
 * @returns {string}
 */
export function renderButton(label, opts = {}) {
  const type = opts.type != null ? String(opts.type) : 'button';
  const cls = opts.className != null ? String(opts.className) : '';
  const attributes = [];
  // Standard attributes: type and class
  attributes.push(`type="${escapeHtml(type)}"`);
  if (cls) {
    attributes.push(`class="${escapeHtml(cls)}"`);
  }
  // Data attributes: action and id
  if (opts.action != null && opts.action !== '') {
    attributes.push(`data-action="${escapeHtml(String(opts.action))}"`);
  }
  if (opts.id != null && opts.id !== '') {
    attributes.push(`data-id="${escapeHtml(String(opts.id))}"`);
  }
  // Additional dataset attributes
  if (opts.dataset && typeof opts.dataset === 'object') {
    for (const key of Object.keys(opts.dataset)) {
      const val = opts.dataset[key];
      if (val == null) continue;
      const s = String(val);
      if (!s.trim()) continue;
      const kebab = key.replace(/([A-Z])/g, '-$1').toLowerCase();
      attributes.push(`data-${escapeHtml(kebab)}="${escapeHtml(s)}"`);
    }
  }
  // Title attribute
  if (opts.title != null && opts.title !== '') {
    attributes.push(`title="${escapeHtml(String(opts.title))}"`);
  }
  // Disabled flag
  if (opts.disabled) {
    attributes.push('disabled');
  }
  // Arbitrary extra attributes
  if (opts.attrs && typeof opts.attrs === 'object') {
    for (const [k, v] of Object.entries(opts.attrs)) {
      if (v == null) continue;
      const s = String(v);
      if (!s.trim()) continue;
      attributes.push(`${escapeHtml(k)}="${escapeHtml(s)}"`);
    }
  }
  const labelEsc = escapeHtml(label ?? '');
  return `<button ${attributes.join(' ')}>${labelEsc}</button>`;
}

/**
 * Renders a container that horizontally groups multiple action buttons.  Each
 * button should already be produced via {@link renderButton}.  The
 * container uses the class `actions-row` by default but can be customised
 * via `opts.className`.  When an empty array is passed an empty
 * string is returned.
 *
 * @param {string[]} buttons Pre-rendered button HTML strings
 * @param {{ className?: string }} [opts]
 * @returns {string}
 */
export function renderActionsRow(buttons, opts = {}) {
  if (!Array.isArray(buttons) || buttons.length === 0) return '';
  const className = opts.className || 'actions-row';
  const clsEsc = escapeHtml(className);
  return `<div class="${clsEsc}">${buttons.join('')}</div>`;
}

/**
 * Renders a detail metadata container using a list of label/value pairs.
 * This helper wraps calls to {@link renderMetaRow} and encloses them
 * in a `.detail-meta` div.  When an empty or falsy array is provided
 * an empty string is returned.  Values are escaped by {@link renderMetaRow}
 * unless the `raw` flag is truthy on the individual row.
 *
 * @param {{ label: any, value: any, raw?: boolean }[]} rows
 * @returns {string}
 */
export function renderDetailMeta(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return '';
  const inner = rows.map((row) => {
    const { label, value, raw } = row || {};
    return renderMetaRow(label, value, { raw: !!raw });
  }).join('');
  return `<div class="detail-meta">${inner}</div>`;
}

/**
 * Renders a muted paragraph.  The provided text is escaped and placed
 * inside a `<p>` with the class `muted`.  When nullish or empty
 * text is provided an empty string is returned.  This helper is
 * useful for explanatory hints and placeholder messages.
 *
 * @param {any} text The content for the muted paragraph.
 * @returns {string}
 */
export function renderMutedParagraph(text) {
  if (text == null || text === '') return '';
  const txt = escapeHtml(text);
  return `<p class="muted">${txt}</p>`;
}