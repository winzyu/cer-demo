/**
 * Account switcher for the context bar — which credential this page talks to the API with.
 *
 * The store and the reasoning behind it live in `auth.js`. This file is only the UI: a select
 * of saved accounts, a form to add one, and a "forget" button.
 *
 * ## Why this is an account picker and not an organization picker
 *
 * A token's organization is decided upstream at login and cannot be asked for. So the way to see
 * another organization's pods is to *be another account*, and this control is how you switch.
 * Every saved entry is one credential; the label is yours to choose ("Superadmin", "Harbor QA").
 *
 * Switching re-runs the pod load, so the fleet, the pod status and every subsequent chat request
 * follow the active account. That is the whole point: with a superadmin token you see all 8
 * organizations' pods, and with a narrowed account you see only that org's — which is the org
 * scoping actually being demonstrated rather than asserted.
 *
 * Same DOM rules as podbar.js: `createElement` + `textContent`, never `innerHTML`. Account
 * labels are user input and go through `textContent` for that reason. The token itself is
 * rendered nowhere, ever — the field that accepts it is `type="password"` and is cleared on
 * save.
 */

import {
  describeToken, forgetAccount, listAccounts, saveAccount, setActiveAccount, signOut,
} from "./auth.js";

let selectEl = null;
let panelEl = null;
let nameEl = null;
let tokenEl = null;
let hintEl = null;
let onChange = null;

const SIGNED_OUT = "";
const ADD_NEW = "__add__";

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Rebuilds the select from the store. Never renders a token, only its label. */
function populate() {
  const accounts = listAccounts();
  selectEl.replaceChildren();

  selectEl.appendChild(el("option", null, accounts.length === 0
    ? "Signed out — add an account"
    : "Signed out"));
  selectEl.lastChild.value = SIGNED_OUT;

  accounts.forEach((account) => {
    const option = el("option", null, account.name);
    option.value = account.id;
    if (account.active) option.selected = true;
    selectEl.appendChild(option);
  });

  const add = el("option", null, "Add an account…");
  add.value = ADD_NEW;
  selectEl.appendChild(add);
}

function openPanel(open) {
  if (!panelEl) return;
  panelEl.hidden = !open;
  if (open && nameEl) nameEl.focus();
}

function setHint(text) {
  if (hintEl) hintEl.textContent = text || "";
}

/** Saves whatever is in the form, then reloads the pod list as the new account. */
function commit() {
  const token = tokenEl ? tokenEl.value : "";
  if (String(token).trim() === "") {
    setHint("Paste a bearer token first.");
    return;
  }

  const described = describeToken(token);
  const fallback = described ? described.split(" · ")[0] : "Account";
  const id = saveAccount((nameEl && nameEl.value) || fallback, token);
  if (!id) {
    setHint("That token could not be saved.");
    return;
  }

  // Cleared immediately: a bearer credential should not sit in a DOM node after it has been
  // stored, and these tokens do not expire.
  if (tokenEl) tokenEl.value = "";
  if (nameEl) nameEl.value = "";
  setHint(described ? `Saved — ${described}` : "Saved.");
  populate();
  openPanel(false);
  if (onChange) onChange();
}

function handleChange() {
  const value = selectEl.value;

  if (value === ADD_NEW) {
    // Leave the select showing the account that is still active, so an abandoned "add" does
    // not read as a switch that happened.
    populate();
    openPanel(true);
    return;
  }

  if (value === SIGNED_OUT) {
    signOut();
  } else {
    setActiveAccount(value);
  }
  setHint("");
  populate();
  if (onChange) onChange();
}

/**
 * Wires the control.
 *
 * `ctx.onChange` is called after any change to the active credential — the pod bar reload is
 * mounted there rather than imported, so this module never depends on podbar.js.
 */
export function initAccountBar(ctx) {
  const context = ctx || {};
  selectEl = context.select || null;
  panelEl = context.panel || null;
  nameEl = context.name || null;
  tokenEl = context.token || null;
  hintEl = context.hint || null;
  onChange = typeof context.onChange === "function" ? context.onChange : null;

  if (!selectEl) return;

  populate();
  openPanel(false);

  selectEl.onchange = handleChange;
  if (context.save) context.save.onclick = commit;
  if (context.cancel) {
    context.cancel.onclick = () => {
      if (tokenEl) tokenEl.value = "";
      setHint("");
      openPanel(false);
    };
  }
  if (context.forget) {
    context.forget.onclick = () => {
      const value = selectEl.value;
      if (value === SIGNED_OUT || value === ADD_NEW) {
        setHint("Choose a saved account to forget.");
        return;
      }
      forgetAccount(value);
      setHint("Forgotten. That token is gone from this browser.");
      populate();
      if (onChange) onChange();
    };
  }

  // Enter in either field saves, which is what a two-field form should do.
  [nameEl, tokenEl].forEach((field) => {
    if (!field) return;
    field.onkeydown = (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        commit();
      }
    };
  });
}

/** Opens the add-account form. The pod bar calls this from its signed-out badge. */
export function promptForAccount() {
  openPanel(true);
}
