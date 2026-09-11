import csv
import json
import os
from types import SimpleNamespace

import export_common

from megahit_plot import (
    build_graph,
    generate_distinct_colours,
    get_bins_list,
    map_segments_to_contigs,
    parse_fasta_with_coverage,
    parse_gfa,
)


def _read_binning(path, delimiter):
    bins = {}
    with open(path, "r", encoding="utf-8", errors="ignore") as f:
        reader = csv.reader(f, delimiter=delimiter)
        for row in reader:
            if not row or len(row) < 2:
                continue
            contig_id = row[0].strip()
            bin_id = row[1].strip()
            bins[contig_id] = bin_id
    return bins


def _read_flag_set(path):
    values = set()
    if not path or not os.path.exists(path):
        return values
    with open(path, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            val = line.strip()
            if val:
                values.add(val)
    return values


def _load_layout_coords(path):
    if not path or not os.path.exists(path):
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        return None

    if isinstance(data, dict) and "coords" in data and isinstance(data["coords"], dict):
        return data["coords"]
    if isinstance(data, dict):
        return data
    return None


def _seq_gc(seq):
    if not seq:
        return None
    s = seq.upper()
    length = len(s)
    if length == 0:
        return None
    return 100.0 * (s.count("G") + s.count("C")) / length


def _extra_colour(index):
    """Deterministic colours for bins that only appear in additional results."""
    import colorsys

    hue = (0.13 + 0.37 * index) % 1.0
    r, g, b = colorsys.hsv_to_rgb(hue, 0.45, 0.85)
    return "#%02x%02x%02x" % (int(r * 255), int(g * 255), int(b * 255))


def export(args_ns: SimpleNamespace, out_json="/out/interactive_graph.json"):
    gfa = args_ns.graph
    contigs_fasta = args_ns.contigs
    initial_path = args_ns.initial
    delimiter = args_ns.delimiter
    output_path = getattr(args_ns, "output", "")
    prefix = getattr(args_ns, "prefix", "")

    contig_order, contig_sequences, contig_coverage = parse_fasta_with_coverage(contigs_fasta)
    segments, links = parse_gfa(gfa)
    segment_to_contig = map_segments_to_contigs(segments, contig_order, contig_sequences)
    g, _segment_index, _segment_index_rev, _contig_to_vertex = build_graph(
        segments, links, segment_to_contig, contig_coverage
    )

    # --- every binning result being compared, in display order ---
    specs = export_common.build_result_specs(args_ns)
    bins_by_result = {
        spec["key"]: _read_binning(spec["path"], spec["delimiter"]) for spec in specs
    }

    misbinned_path = getattr(args_ns, "misbinned", None)
    if not misbinned_path:
        misbinned_path = f"{output_path}{prefix}graphbin_misbinned.csv"
    misbinned = _read_flag_set(misbinned_path)

    ambiguous_multi_path = getattr(args_ns, "ambiguous_multi", None)
    if not ambiguous_multi_path:
        ambiguous_multi_path = f"{output_path}{prefix}graphbin_ambiguous.csv"
    ambiguous_multi = _read_flag_set(ambiguous_multi_path)

    # --- decision provenance recorded during refinement ---
    provenance_path = getattr(args_ns, "provenance", None)
    if not provenance_path:
        provenance_path = f"{output_path}{prefix}graphbin_provenance.json"
    provenance, provenance_meta = export_common.load_provenance(provenance_path)
    provenance_meta["max_iteration"] = export_common.max_iteration_in(provenance)

    layout_path = getattr(args_ns, "layout", None)
    if not layout_path:
        layout_path = f"{output_path}{prefix}layout.json"
    layout_coords = _load_layout_coords(layout_path)
    fallback_layout = None

    deg = g.degree()

    nodes = []
    for v in range(len(g.vs)):
        node_id = g.vs[v]["name"]
        segment_id = g.vs[v]["segment"]

        if layout_coords and node_id in layout_coords:
            coord = layout_coords[node_id]
            x = float(coord[0])
            y = float(coord[1])
        else:
            if fallback_layout is None:
                fallback_layout = g.layout_fruchterman_reingold()
            x = float(fallback_layout.coords[v][0])
            y = float(fallback_layout.coords[v][1])

        seq = contig_sequences.get(node_id)
        if seq is None:
            seq = segments.get(segment_id, "")

        node = {
            "id": node_id,
            "x": x,
            "y": y,
            "len": int(len(seq)),
            "gc": _seq_gc(seq),
            "degree": int(deg[v]),
            "cov": g.vs[v]["coverage"],
            "misbinned": node_id in misbinned,
            "ambiguous_multi": node_id in ambiguous_multi,
        }

        export_common.attach_comparison(
            node, {k: bins_by_result[k].get(node_id) for k in bins_by_result}, specs
        )

        record = provenance.get(node_id)
        if record:
            node["prov"] = record

        nodes.append(node)

    edges = [[g.vs[u]["name"], g.vs[v]["name"]] for (u, v) in g.get_edgelist()]

    bins_list = get_bins_list(initial_path, delimiter)
    colours = generate_distinct_colours(len(bins_list))
    bin_colors = {bins_list[i]: colours[i] for i in range(len(bins_list))}

    # bins that only occur in additional results still need a stable colour
    extra_index = 0
    for key in bins_by_result:
        for bin_label in sorted(set(bins_by_result[key].values())):
            if bin_label and bin_label not in bin_colors:
                bin_colors[bin_label] = _extra_colour(extra_index)
                extra_index += 1

    out = export_common.build_export(
        nodes, edges, specs, bin_colors, provenance_meta, unbinned_color="#d3d3d3"
    )

    with open(out_json, "w", encoding="utf-8") as f:
        json.dump(out, f)
