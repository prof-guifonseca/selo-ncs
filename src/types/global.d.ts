/**
 * Global ambient typings for the NCS front-end / functions runtime.
 *
 * Goal: enable TypeScript (checkJs + noEmit) without forcing a TS migration.
 * Keep these declarations minimal and permissive to avoid blocking development.
 */

export {};

declare global {
  /**
   * Auth/session cache used by backend-only mode (in-memory).
   * NOTE: this is intentionally permissive; see src/services/api.js.
   */
  // eslint-disable-next-line no-var
  var __NCS_AUTH: {
    access_token?: string;
    token?: string;
    jwt?: string;
    email?: string;
    [key: string]: unknown;
  } | undefined;

  interface Window {
    /** Base URL for the /api router (Netlify Functions). */
    NCS_API_BASE?: string;

    /** UI helper namespace exposed by src/ui.js (debug/dev convenience). */
    NCSUI?: unknown;

    /** Build metadata injected at compile time.  Optional because builds
     *  without this flag should not break type checking. */
    __NCS_BUILD?: any;
    /** Disable AI features flag. */
    __NCS_DISABLE_AI?: any;
    /** Telemetry opt‑out flags. */
    __NCS_TELEMETRY_OFF__?: any;
    NCS_TELEMETRY_OFF?: any;

    /** Chat context helpers injected on window.  These properties are
     *  defined at runtime by the chat module and referenced in various
     *  dashboards. */
    ncsGetChatContext?: (...args: any[]) => any;
    ncsSetAuditorChatProcess?: (...args: any[]) => any;
    __ncsAuditorChatProcess?: any;

    /** Modal helpers promoted to window for backwards compatibility. */
    openModal?: (...args: any[]) => any;
    closeModal?: (...args: any[]) => any;
    togglePassword?: (...args: any[]) => any;
    switchAuthTab?: (...args: any[]) => any;
  }

  /**
   * Extend the Element interface with HTML‑specific properties.  Many UI
   * handlers work with generic Elements but rely on properties like
   * `dataset`, `value`, `checked` and `name`.  Adding these here
   * prevents pervasive casting throughout the codebase.
   */
  interface Element {
    /** Data attributes accessor (HTMLDataset). */
    dataset?: DOMStringMap;
    /** Input or select value. */
    value?: any;
    /** Checkbox/radio state. */
    checked?: boolean;
    /** Form field name. */
    name?: string;
    /** Trigger a click programmatically. */
    click?: () => any;
  }

  /** Extend EventTarget so that `.closest()` is available on event targets. */
  interface EventTarget {
    closest?: (selector: string) => Element | null;
  }

  /** Extend Event with common custom properties used in the codebase. */
  interface Event {
    /** Custom event detail payload. */
    detail?: any;
    /** Keyboard event key. */
    key?: string;
  }

  /** Extend HTML elements with custom flags used for binding state. */
  interface HTMLElement {
    /** Marker to prevent multiple backdrop listeners on modals. */
    __ncsBackdropBound?: any;
  }
  interface HTMLInputElement {
    /** Prevent double binding of Enter key listeners. */
    __ncsEnterBound?: any;
  }
  interface HTMLTextAreaElement {
    /** Prevent double binding of Enter key listeners. */
    __ncsEnterBound?: any;
  }
}
