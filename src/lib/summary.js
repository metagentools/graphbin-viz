/**
 * The refinement summary: how much of the result refinement actually decided,
 * how confident those decisions were, and which contigs are worth opening
 * first. Without it the only way into a fresh result is to click around the
 * graph blindly.
 */

import { CONFIDENCE_BUCKETS, STAGE_SUMMARY_ORDER } from "../constants/stages.js";
import { getResults, nodeDisagreement, nodeStageGroup, nodeUncertainty, rawBin } from "./model.js";

export function summariseModel(model) {
  const stages = {};
  for (const key of STAGE_SUMMARY_ORDER) stages[key] = [];

  const confidence = CONFIDENCE_BUCKETS.map(() => []);
  const disputed = [];
  const bins = new Set();
  const results = getResults(model);

  for (const n of model.nodes) {
    stages[nodeStageGroup(n)].push(n.id);

    const uncertainty = nodeUncertainty(n);
    if (uncertainty != null) {
      const value = 1 - uncertainty;
      const index = CONFIDENCE_BUCKETS.findIndex((b) => value >= b.lo && value < b.hi);
      confidence[index < 0 ? CONFIDENCE_BUCKETS.length - 1 : index].push(n.id);
    }

    if (nodeDisagreement(n) > 0) disputed.push(n.id);

    for (const r of results) {
      const b = rawBin(n, r.key);
      if (b) bins.add(b);
    }
  }

  return { stages, confidence, disputed, bins: bins.size };
}

/**
 * The contigs worth opening first: those the results disagree about, and
 * those refinement decided with the least support.
 */
export function contigsNeedingAttention(model, limit = 10) {
  const scored = [];

  for (const n of model.nodes) {
    const disagreement = nodeDisagreement(n);
    const uncertainty = nodeUncertainty(n);
    const stage = nodeStageGroup(n);

    if (disagreement <= 0 && (uncertainty == null || uncertainty < 0.25)) continue;

    let reason;
    if (stage === "stripped") reason = "label removed";
    else if (disagreement > 0 && uncertainty != null && uncertainty >= 0.5)
      reason = "tools disagree, low confidence";
    else if (disagreement > 0) reason = "tools disagree";
    else reason = "low confidence";

    scored.push({
      id: n.id,
      reason,
      score: disagreement * 2 + (uncertainty == null ? 0 : uncertainty),
      confidence: uncertainty == null ? null : 1 - uncertainty,
    });
  }

  scored.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

  // Ranking alone fills the list with whichever failure mode is most common
  // (usually removed labels). Take the worst few of each reason instead, so
  // the list shows the range of what is wrong rather than one category.
  const perReason = Math.max(2, Math.ceil(limit / 3));
  const counts = new Map();
  const spread = [];

  for (const item of scored) {
    const seen = counts.get(item.reason) || 0;
    if (seen >= perReason) continue;
    counts.set(item.reason, seen + 1);
    spread.push(item);
    if (spread.length >= limit) break;
  }

  // top up from the ranking if some reasons are absent
  if (spread.length < limit) {
    const taken = new Set(spread.map((item) => item.id));
    for (const item of scored) {
      if (taken.has(item.id)) continue;
      spread.push(item);
      if (spread.length >= limit) break;
    }
  }

  return spread.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}
