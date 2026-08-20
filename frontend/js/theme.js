/**
 * Light/dark theme: OS preference by default, an explicit choice wins and persists.
 *
 * Directions A and B from the design canvas are the same layout with a swapped token set,
 * so switching is one attribute on <html> — theme.css defines both palettes.
 *
 * The initial stamp happens in an inline <head> script in index.html, not here: this module
 * loads as ESM (deferred), and applying the theme after first paint flashes the wrong one.
 * This file owns the toggle only.
 */

const STORAGE_KEY = "gilligan.theme";

/**
 * Whether someone has chosen a theme in this page view.
 *
 * Tracked here as well as in `localStorage` because storage can be unavailable (private mode,
 * a cookie-blocked iframe) — there `apply()`'s `setItem` throws into an empty catch, and a
 * listener that asked `storedTheme()` would conclude nothing had been chosen and revert the
 * choice the user just made.
 */
let chosen = false;

/** "light" | "dark" | null (null = follow the OS) */
function storedTheme() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "light" || v === "dark" ? v : null;
  } catch {
    return null; // private mode / storage disabled — fall back to the OS preference
  }
}

/** What is actually on screen right now, whether chosen or inherited from the OS. */
function activeTheme() {
  const explicit = document.documentElement.dataset.theme;
  if (explicit === "light" || explicit === "dark") return explicit;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function apply(theme) {
  document.documentElement.dataset.theme = theme;
  chosen = true;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Not fatal: the theme still applies for this page view, and `chosen` above keeps the OS
    // listener from undoing it.
  }
}

function toggleTheme() {
  const next = activeTheme() === "dark" ? "light" : "dark";
  apply(next);
  return next;
}

/** Points the button's accessible state at the theme actually on screen. */
function syncLabel(button, theme) {
  button.setAttribute(
    "aria-label",
    theme === "dark" ? "Switch to light theme" : "Switch to dark theme",
  );
  button.setAttribute("aria-pressed", String(theme === "dark"));
}

/**
 * Wires the toggle button and keeps an un-chosen page in step with the OS.
 * Once someone has chosen, OS changes are ignored — that is the point of choosing.
 */
export function initTheme(button) {
  chosen = storedTheme() !== null;

  if (button) {
    // Synced once up front, not only on click. index.html ships `aria-pressed="false"` and
    // "Switch to dark theme" as static markup, so a page that loads dark — from a stored
    // choice or from the OS — used to describe itself as light until the first click.
    syncLabel(button, activeTheme());
    button.addEventListener("click", () => {
      syncLabel(button, toggleTheme());
    });
  }

  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (chosen) return;
    delete document.documentElement.dataset.theme;
    if (button) syncLabel(button, activeTheme());
  });
}
