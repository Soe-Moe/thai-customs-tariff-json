// Privilege codes whose rates itd.customs.go.th marks with a red `**`.
// REFDRT has no per-row condition marker, so has_condition is set per scheme
// from this list. `npm run check:portal` re-checks it against the live portal;
// update it (and re-run `npm run build`) whenever that check fails.
// Last checked: 2026-09-30.
const PORTAL_CONDITION_CODES = new Set(["ATG", "ACN", "AK1"]);

module.exports = { PORTAL_CONDITION_CODES };
