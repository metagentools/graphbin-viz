"""Shared helpers for building the GraphBin-Viz interactive graph export.

This module holds the parts of the export that are independent of the
assembler: assembling an arbitrary *set* of binning results for comparison,
computing per-contig agreement statistics across those results, and attaching
the decision provenance recorded during refinement.

The export deliberately treats GraphBin as one labelled result among several
rather than as a privileged "final" answer, so the interface can compare any
number of binning tools over the same assembly graph.
"""

import csv
import json
import os


UNBINNED = "(unbinned)"


# ---------------------------------------------------------------------------
# Result specifications
# ---------------------------------------------------------------------------

def build_result_specs(args_ns):
    """Return the ordered list of binning results to compare.

    Accepts either the legacy `initial` / `final` pair or an explicit
    `results` list of {name, path, kind, delimiter} mappings. The legacy pair is
    always placed first so existing behaviour is preserved.
    """
    delimiter = getattr(args_ns, "delimiter", ",")
    specs = []

    initial_path = getattr(args_ns, "initial", None)
    final_path = getattr(args_ns, "final", None)

    if initial_path:
        specs.append(
            {
                "key": "r0",
                "name": getattr(args_ns, "initial_name", None) or "Initial",
                "kind": "initial",
                "path": initial_path,
                "delimiter": delimiter,
            }
        )
    if final_path:
        specs.append(
            {
                "key": "r1",
                "name": getattr(args_ns, "final_name", None) or "GraphBin",
                "kind": "graphbin",
                "path": final_path,
                "delimiter": delimiter,
            }
        )

    extra = getattr(args_ns, "results", None) or []
    for i, item in enumerate(extra):
        path = item.get("path") if isinstance(item, dict) else None
        if not path or not os.path.exists(path):
            continue
        specs.append(
            {
                "key": f"r{len(specs)}",
                "name": (item.get("name") if isinstance(item, dict) else None)
                or f"Result {len(specs) + 1}",
                "kind": (item.get("kind") if isinstance(item, dict) else None) or "other",
                "path": path,
                "delimiter": (item.get("delimiter") if isinstance(item, dict) else None)
                or delimiter,
            }
        )

    return specs


def read_binning_rows(path, delimiter):
    """Read a binning result as a list of (contig label, bin label) rows."""
    rows = []
    with open(path, "r", encoding="utf-8", errors="ignore") as f:
        reader = csv.reader(f, delimiter=delimiter)
        for row in reader:
            if not row or len(row) < 2:
                continue
            rows.append((row[0].strip(), row[1].strip()))
    return rows


# ---------------------------------------------------------------------------
# Cross-result agreement
# ---------------------------------------------------------------------------

def _norm(label):
    if label is None or label == "":
        return UNBINNED
    return str(label)


def compare_assignments(bins_by_key, keys):
    """Summarise how a single contig is assigned across every result.

    Returns the number of distinct labels, the fraction of result *pairs* that
    disagree, the most frequently assigned bin, and the share of results
    supporting it. Unbinned counts as a label of its own, so a contig that one
    tool bins and another discards registers as a disagreement.
    """
    labels = [_norm(bins_by_key.get(k)) for k in keys]
    n = len(labels)

    if n == 0:
        return {
            "n_distinct": 0,
            "disagreement": 0.0,
            "consensus_bin": None,
            "consensus_frac": 0.0,
        }

    counts = {}
    for label in labels:
        counts[label] = counts.get(label, 0) + 1

    # fraction of unordered pairs that disagree
    total_pairs = n * (n - 1) / 2
    if total_pairs > 0:
        agreeing = sum(c * (c - 1) / 2 for c in counts.values())
        disagreement = (total_pairs - agreeing) / total_pairs
    else:
        disagreement = 0.0

    # consensus prefers an actual bin over "unbinned" when they tie
    ranked = sorted(
        counts.items(),
        key=lambda kv: (kv[1], kv[0] != UNBINNED),
        reverse=True,
    )
    consensus_bin, consensus_count = ranked[0]
    if consensus_bin == UNBINNED and len(ranked) > 1 and ranked[1][1] == consensus_count:
        consensus_bin, consensus_count = ranked[1]

    return {
        "n_distinct": len(counts),
        "disagreement": round(disagreement, 6),
        "consensus_bin": None if consensus_bin == UNBINNED else consensus_bin,
        "consensus_frac": round(consensus_count / n, 6),
    }


# ---------------------------------------------------------------------------
# Provenance
# ---------------------------------------------------------------------------

def load_provenance(path, key_fn=None):
    """Load the provenance record written by GraphBin, re-keyed for the export.

    `key_fn` maps the contig name used by GraphBin onto the node id used by the
    interactive graph; contig names that cannot be mapped are dropped.
    """
    if not path or not os.path.exists(path):
        return {}, {}

    try:
        with open(path, "r", encoding="utf-8") as f:
            payload = json.load(f)
    except Exception:
        return {}, {}

    records = payload.get("records", {}) or {}
    meta = {
        "lp_iterations": payload.get("lp_iterations", 0),
        "lp_converged": payload.get("lp_converged", False),
        "n_seeds": payload.get("n_seeds", 0),
        "stages": payload.get("stages", []),
    }

    if key_fn is None:
        return records, meta

    remapped = {}
    for name, record in records.items():
        node_id = key_fn(name)
        if node_id is None:
            continue

        out = dict(record)
        support = out.get("support")
        if support:
            translated = []
            for src_name, value in support:
                src_id = key_fn(src_name)
                if src_id is not None:
                    translated.append([src_id, value])
            out["support"] = translated

        remapped[node_id] = out

    return remapped, meta


def max_iteration_in(provenance):
    """Largest propagation iteration referenced by any record."""
    best = 0
    for record in provenance.values():
        first = record.get("first_iter")
        if isinstance(first, int) and first > best:
            best = first
        for entry in record.get("history", []) or []:
            try:
                if entry[0] > best:
                    best = entry[0]
            except Exception:
                continue
    return best


# ---------------------------------------------------------------------------
# Assembly
# ---------------------------------------------------------------------------

def attach_comparison(node, bins_by_key, specs):
    """Attach the per-result assignments and agreement stats to a node dict."""
    keys = [s["key"] for s in specs]

    node["bins"] = {k: bins_by_key.get(k) for k in keys}
    node.update(compare_assignments(bins_by_key, keys))

    # Back-compatible aliases: the first result is "initial", the GraphBin
    # result (or the second result) is "final".
    initial_key = specs[0]["key"] if specs else None
    final_key = None
    for s in specs:
        if s["kind"] == "graphbin":
            final_key = s["key"]
            break
    if final_key is None and len(specs) > 1:
        final_key = specs[1]["key"]

    init_bin = bins_by_key.get(initial_key) if initial_key else None
    fin_bin = bins_by_key.get(final_key) if final_key else None

    node["initial_bin"] = init_bin
    node["final_bin"] = fin_bin
    node["changed"] = init_bin != fin_bin

    return node


def build_export(nodes, edges, specs, bin_colors, provenance_meta,
                 unbinned_color="#d3d3d3"):
    return {
        "schema": 2,
        "results": [
            {"key": s["key"], "name": s["name"], "kind": s["kind"]} for s in specs
        ],
        "nodes": nodes,
        "edges": edges,
        "bin_colors": bin_colors,
        "unbinned_color": unbinned_color,
        "provenance_meta": provenance_meta,
    }
