// Community consensus: each answer counts with the weight of the person who gave it, their reliability measured on
// hidden test objects ((correct + 1) / (graded + 2), so 0.5 until they have been graded). A decision needs a few
// people and a clear majority; until then the object stays open.

export const MIN_VOTERS = 3;
export const MIN_WEIGHT = 1.2;
export const MAJORITY = 0.6;

/** Spot check and Follow a star: weights by label -> { status, label, share }. */
export function spotVerdict(w, n) {
  const total = Object.values(w).reduce((s, x) => s + x, 0);
  if (n < MIN_VOTERS || total < MIN_WEIGHT) return { status: "open", label: null, share: null };
  const [label, top] = Object.entries(w).sort((a, b) => b[1] - a[1])[0];
  const share = top / total;
  if (share < MAJORITY || label === "unsure") return { status: "open", label: null, share: round(share) };
  return { status: label === "artifact" ? "rejected" : "lead", label, share: round(share) };
}

/** Sky hunt: "is there a red dot?" -> yes (red) against every kind of no (star, glare, nothing). */
export function skyVerdict(w, n) {
  const total = Object.values(w).reduce((s, x) => s + x, 0);
  if (n < MIN_VOTERS || total < MIN_WEIGHT) return { status: "open", share: null };
  const yes = (w.red ?? 0) / total;
  if (yes >= MAJORITY) return { status: "lead", share: round(yes) };
  if (1 - yes >= MAJORITY) return { status: "rejected", share: round(1 - yes) };
  return { status: "open", share: round(yes) };
}

const round = (x) => Math.round(x * 100) / 100;
