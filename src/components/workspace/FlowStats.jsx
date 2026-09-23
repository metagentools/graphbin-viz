import React from "react";

const STATS = [
  { id: "flow-stat-changed", key: "changed", label: "Changed bin" },
  { id: "flow-stat-reassigned", key: "reassigned", label: "Re-assigned" },
  { id: "flow-stat-unbinned-to-binned", key: "unbinnedToBinned", label: "Newly binned" },
  { id: "flow-stat-binned-to-unbinned", key: "binnedToUnbinned", label: "Unbinned" },
];

/** What refinement did, in four numbers. */
export function FlowStats({ stats }) {
  return (
    <div className="flow-stats">
      {STATS.map((stat) => (
        <div className="flow-stat" key={stat.id}>
          <div className="flow-stat-label">{stat.label}</div>
          <div id={stat.id} className="flow-stat-value">
            {stats ? String(stats[stat.key]) : "—"}
          </div>
        </div>
      ))}
    </div>
  );
}
