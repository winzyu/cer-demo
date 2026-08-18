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

/** "light" | "dark" | null (null = follow the OS) */
export function storedTheme() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "light" || v === "dark" ? v : null;
  } catch {
    return null; // private mode / storage disabled — fall back to the OS preference
  }
}

/** What is actually on screen right now, whether chosen or inherited from the OS. */
export function activeTheme() {
  const explicit = document.documentElement.dataset.theme;
  if (explicit === "light" || explicit === "dark") return explicit;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function apply(theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Not fatal: the theme still applies for this page view.
  }
}

export function toggleTheme() {
  const next = activeTheme() === "dark" ? "light" : "dark";
  apply(next);
  return next;
}

/**
 * Wires the toggle button and keeps an un-chosen page in step with the OS.
 * Once someone has chosen, OS changes are ignored — that is the point of choosing.
 */
export function initTheme(button) {
  if (button) {
    button.addEventListener("click", () => {
      const next = toggleTheme();
      button.setAttribute("aria-label", next === "dark" ? "Switch to light theme" : "Switch to dark theme");
      button.setAttribute("aria-pressed", String(next === "dark"));
    });
  }

  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (storedTheme() === null) delete document.documentElement.dataset.theme;
  });
}
