#!/usr/bin/env python3

"""GraphBin refinement core, instrumented for GraphBin-Viz.

In addition to producing the refined binning, this module records a per-contig
*decision record* describing how each contig arrived at its final bin: whether
its initial label survived label correction, whether it was stripped and why,
whether the label was inferred by propagation (and with what support and
confidence), and how far it sits from the nearest seeded contig.

It also accepts a set of user-supplied `locked` assignments, which are treated
as immovable seeds. This allows an analyst to correct an assignment in the
interface and re-run refinement under that constraint.
"""

import logging

from labelpropagation.labelprop import LabelProp


__author__ = "Vijini Mallawaarachchi"
__copyright__ = "Copyright 2019-2022, GraphBin Project"
__credits__ = ["Vijini Mallawaarachchi", "Anuradha Wickramarachchi", "Yu Lin"]
__license__ = "BSD-3"
__version__ = "1.7.4"
__maintainer__ = "Vijini Mallawaarachchi"
__email__ = "viji.mallawaarachchi@gmail.com"
__status__ = "Production"

logger = logging.getLogger(f"GraphBin {__version__}")

MIN_BIN_COUNT = 5

# Stage vocabulary used by the provenance record.
STAGE_SEED = "seed"                  # initial label survived correction, seeded propagation
STAGE_LOCKED = "locked"              # analyst-supplied assignment, immovable
STAGE_STRIPPED_NEIGHBOUR = "stripped_neighbour"   # removed: direct neighbours disagreed
STAGE_STRIPPED_CLOSEST = "stripped_closest"       # removed: nearest labelled vertices disagreed
STAGE_PROPAGATED = "propagated"      # label inferred by propagation
STAGE_STRIPPED_POST = "stripped_post"  # label removed after propagation
STAGE_UNRESOLVED = "unresolved"      # no label available (isolated / unlabelled component)


def getClosestLabelledVertices(graph, node, binned_contigs):
    # Remove labels of ambiguous vertices
    # -------------------------------------

    queu_l = [graph.neighbors(node, mode="ALL")]
    visited_l = [node]
    labelled = []

    while len(queu_l) > 0:
        active_level = queu_l.pop(0)
        is_finish = False
        visited_l += active_level

        for n in active_level:
            if n in binned_contigs:
                is_finish = True
                labelled.append(n)
        if is_finish:
            return labelled
        else:
            temp = []
            for n in active_level:
                temp += graph.neighbors(n, mode="ALL")
                temp = list(set(temp))
            temp2 = []

            for n in temp:
                if n not in visited_l:
                    temp2.append(n)
            if len(temp2) > 0:
                queu_l.append(temp2)
    return labelled


def _build_contig_bin_map(n_bins, bins):
    contig_to_bin = {}
    for b in range(n_bins):
        for contig in bins[b]:
            contig_to_bin[contig] = b
    return contig_to_bin


def _find_misbinned_vertices(n_bins, bins, assembly_graph, binned_contigs):
    contig_to_bin = _build_contig_bin_map(n_bins, bins)
    misbinned = []

    for contig, my_bin in contig_to_bin.items():
        closest = getClosestLabelledVertices(assembly_graph, contig, binned_contigs)
        labelled_bins = []
        for neighbour in closest:
            if neighbour in contig_to_bin:
                labelled_bins.append(contig_to_bin[neighbour])

        if not labelled_bins:
            continue

        if (len(labelled_bins) == 1 and labelled_bins[0] != my_bin) or all(
            nb != my_bin for nb in labelled_bins
        ):
            misbinned.append(contig)

    return misbinned


def _find_ambiguous_vertices(n_bins, bins, assembly_graph, misbinned_set, binned_contigs):
    contig_to_bin = _build_contig_bin_map(n_bins, bins)
    ambiguous = []

    for contig, my_bin in contig_to_bin.items():
        if contig in misbinned_set:
            continue
        closest = getClosestLabelledVertices(assembly_graph, contig, binned_contigs)
        labelled_bins = []
        for neighbour in closest:
            if neighbour in contig_to_bin:
                labelled_bins.append(contig_to_bin[neighbour])

        if len(labelled_bins) <= 1:
            continue

        if len(set(labelled_bins)) > 1:
            ambiguous.append(contig)

    return ambiguous


def _neighbour_bin_counts(assembly_graph, contig, bin_by_contig):
    """Distribution of bins across the direct neighbours of a contig.

    `bin_by_contig` maps a contig to its bin *label*; contigs absent from the
    mapping are counted as unbinned so the caller can see how much of a
    neighbourhood carries no evidence at all.
    """
    counts = {}
    for neighbour in assembly_graph.neighbors(contig, mode="all"):
        label = bin_by_contig.get(neighbour)
        key = label if label is not None else "(unbinned)"
        counts[key] = counts.get(key, 0) + 1
    return counts


def _hop_distance_from_seeds(assembly_graph, seeds, node_count):
    """Breadth-first distance from every contig to the nearest seeded contig."""
    dist = {}
    frontier = []
    for s in seeds:
        dist[s] = 0
        frontier.append(s)

    depth = 0
    while frontier:
        depth += 1
        nxt = []
        for u in frontier:
            for v in assembly_graph.neighbors(u, mode="all"):
                if v not in dist:
                    dist[v] = depth
                    nxt.append(v)
        frontier = nxt

    return dist


def graphbin_main(
    n_bins,
    bins,
    bins_list,
    assembly_graph,
    node_count,
    diff_threshold,
    max_iteration,
    min_bin_size=MIN_BIN_COUNT,
    show_lp_log=False,
    locked=None,
    collect_provenance=True,
):
    if min_bin_size is None or min_bin_size < 1:
        min_bin_size = MIN_BIN_COUNT

    # Analyst-supplied immovable assignments: {contig_index: bin_index}
    locked = dict(locked or {})
    if locked:
        logger.info(f"Applying {len(locked)} locked assignment(s) from the analyst")
        # Seed the locked contigs into their chosen bins before anything else.
        for contig, target_bin in locked.items():
            if target_bin is None or target_bin < 0 or target_bin >= n_bins:
                continue
            for b in range(n_bins):
                if contig in bins[b] and b != target_bin:
                    bins[b].remove(contig)
            if contig not in bins[target_bin]:
                bins[target_bin].append(contig)

    logger.info("Determining ambiguous vertices")

    binned_contigs = []
    for n in range(n_bins):
        binned_contigs = sorted(binned_contigs + bins[n])

    # Bin membership as supplied by the initial binning tool, before correction.
    initial_contig_to_bin = _build_contig_bin_map(n_bins, bins)

    misbinned = _find_misbinned_vertices(n_bins, bins, assembly_graph, binned_contigs)
    ambiguous = _find_ambiguous_vertices(
        n_bins, bins, assembly_graph, set(misbinned), binned_contigs
    )

    # provenance: why each label was stripped
    strip_reason = {}

    remove_by_bin = {}

    remove_labels_initial = []

    neighbours_have_same_label_list = []

    for b in range(n_bins):
        for i in bins[b]:
            if i in locked:
                continue
            my_bin = b

            # Get set of closest labelled vertices with distance = 1
            closest_neighbours = assembly_graph.neighbors(i, mode="all")

            # Determine whether all the closest labelled vertices have the same label as its own
            neighbours_have_same_label = True

            neighbours_binned = False

            for neighbour in closest_neighbours:
                for k in range(n_bins):
                    if neighbour in bins[k]:
                        neighbours_binned = True
                        if k != my_bin:
                            neighbours_have_same_label = False
                            break

            if not neighbours_have_same_label:
                if my_bin in remove_by_bin:
                    if len(bins[my_bin]) - len(remove_by_bin[my_bin]) >= min_bin_size:
                        remove_labels_initial.append(i)
                        remove_by_bin[my_bin].append(i)
                        strip_reason[i] = STAGE_STRIPPED_NEIGHBOUR
                else:
                    if len(bins[my_bin]) >= min_bin_size:
                        remove_labels_initial.append(i)
                        remove_by_bin[my_bin] = [i]
                        strip_reason[i] = STAGE_STRIPPED_NEIGHBOUR

            elif neighbours_binned:
                neighbours_have_same_label_list.append(i)

    for i in remove_labels_initial:
        for n in range(n_bins):
            if i in bins[n]:
                bins[n].remove(i)

    # Further remove labels of ambiguous vertices
    for b in range(n_bins):
        for i in bins[b]:
            if i in locked:
                continue
            if i not in neighbours_have_same_label_list:
                my_bin = b

                # Get set of closest labelled vertices
                closest_neighbours = getClosestLabelledVertices(
                    assembly_graph, i, binned_contigs
                )

                if len(closest_neighbours) > 0:
                    # Determine whether all the closest labelled vertices have the same label as its own
                    neighbours_have_same_label = True

                    for neighbour in closest_neighbours:
                        for k in range(n_bins):
                            if neighbour in bins[k]:
                                if k != my_bin:
                                    neighbours_have_same_label = False
                                    break

                    if not neighbours_have_same_label and i not in remove_labels_initial:
                        if my_bin in remove_by_bin:
                            if (
                                len(bins[my_bin]) - len(remove_by_bin[my_bin])
                                >= min_bin_size
                            ):
                                remove_labels_initial.append(i)
                                remove_by_bin[my_bin].append(i)
                                strip_reason[i] = STAGE_STRIPPED_CLOSEST
                        else:
                            if len(bins[my_bin]) >= min_bin_size:
                                remove_labels_initial.append(i)
                                remove_by_bin[my_bin] = [i]
                                strip_reason[i] = STAGE_STRIPPED_CLOSEST

    logger.info("Removing labels of ambiguous vertices")

    # Remove labels of ambiguous vertices
    for i in remove_labels_initial:
        for n in range(n_bins):
            if i in bins[n]:
                bins[n].remove(i)

    logger.info("Obtaining the refined binning result")

    # Contigs that still carry a label at this point are the seeds of propagation.
    seed_contig_to_bin = _build_contig_bin_map(n_bins, bins)

    # Get vertices which are not isolated and not in components without any labels
    # -----------------------------------------------------------------------------

    logger.info(
        "Deteremining vertices which are not isolated and not in components without any labels"
    )

    non_isolated = []

    for i in range(node_count):
        if i not in non_isolated and i in binned_contigs:
            component = []
            component.append(i)
            length = len(component)
            neighbours = assembly_graph.neighbors(i, mode="all")

            for neighbor in neighbours:
                if neighbor not in component:
                    component.append(neighbor)

            component = list(set(component))

            while length != len(component):
                length = len(component)

                for j in component:
                    neighbours = assembly_graph.neighbors(j, mode="all")

                    for neighbor in neighbours:
                        if neighbor not in component:
                            component.append(neighbor)

            labelled = False
            for j in component:
                if j in binned_contigs:
                    labelled = True
                    break

            if labelled:
                for j in component:
                    if j not in non_isolated:
                        non_isolated.append(j)

    logger.info("Number of non-isolated contigs: " + str(len(non_isolated)))

    # Run label propagation
    # -----------------------

    data = []

    for contig in range(node_count):
        # Consider vertices that are not isolated

        if contig in non_isolated:
            line = []
            line.append(contig)

            assigned = False

            for i in range(n_bins):
                if contig in bins[i]:
                    line.append(i + 1)
                    assigned = True

            if not assigned:
                line.append(0)

            neighbours = assembly_graph.neighbors(contig, mode="all")

            neighs = []

            for neighbour in neighbours:
                n = []
                n.append(neighbour)
                n.append(1.0)
                neighs.append(n)

            line.append(neighs)

            data.append(line)

    # Check if initial binning result consists of contigs belonging to multiple bins

    multiple_bins = False

    for item in data:
        if type(item[1]) is int and type(item[2]) is int:
            multiple_bins = True
            break

    if multiple_bins:
        logger.error(
            "Initial binning result consists of contigs belonging to multiple bins. Please make sure that each contig in the initial binning result belongs to only one bin."
        )
        logger.info("Exiting GraphBin... Bye...!")
        raise RuntimeError(
            "Initial binning result has contigs assigned to multiple bins."
        )

    # Label propagation

    lp = LabelProp()

    lp.load_data_from_mem(data)

    logger.info(
        "Starting label propagation with eps="
        + str(diff_threshold)
        + " and max_iteration="
        + str(max_iteration)
    )

    logger_state = None
    if show_lp_log:
        logger_state = (logger.level, [h.level for h in logger.handlers])
        logger.setLevel(logging.DEBUG)
        for h in logger.handlers:
            h.setLevel(logging.DEBUG)

    try:
        ans = lp.run(
            diff_threshold,
            max_iteration,
            show_log=show_lp_log,
            clean_result=False,
            track_provenance=collect_provenance,
        )
    finally:
        if logger_state is not None:
            prev_level, prev_handler_levels = logger_state
            logger.setLevel(prev_level)
            for h, level in zip(logger.handlers, prev_handler_levels):
                h.setLevel(level)

    logger.info("Obtaining Label Propagation result")

    lp_provenance = lp.get_provenance() if collect_provenance else {}
    lp_iterations = getattr(lp, "iterations_run", 0)
    lp_converged = getattr(lp, "converged", False)

    for l in ans:
        for i in range(n_bins):
            if l[1] == i + 1 and l[0] not in bins[i]:
                bins[i].append(l[0])

    # Remove labels of ambiguous vertices
    # -------------------------------------

    logger.info("Determining ambiguous vertices")

    remove_by_bin = {}

    remove_labels = []

    for b in range(n_bins):
        for i in bins[b]:
            if i in locked:
                continue
            my_bin = b

            closest_neighbours = assembly_graph.neighbors(i, mode="all")

            # Determine whether all the closest labelled vertices have the same label as its own
            neighbours_have_same_label = True

            for neighbour in closest_neighbours:
                for k in range(n_bins):
                    if neighbour in bins[k]:
                        if k != my_bin:
                            neighbours_have_same_label = False
                            break

            if not neighbours_have_same_label:
                if my_bin in remove_by_bin:
                    if len(bins[my_bin]) - len(remove_by_bin[my_bin]) >= min_bin_size:
                        remove_labels.append(i)
                        remove_by_bin[my_bin].append(i)
                else:
                    if len(bins[my_bin]) >= min_bin_size:
                        remove_labels.append(i)
                        remove_by_bin[my_bin] = [i]

    logger.info("Removing labels of ambiguous vertices")

    # Remove labels of ambiguous vertices
    for i in remove_labels:
        for n in range(n_bins):
            if i in bins[n]:
                bins[n].remove(i)

    logger.info("Obtaining the Final Refined Binning result")

    final_bins = {}

    for i in range(n_bins):
        for contig in bins[i]:
            final_bins[contig] = bins_list[i]

    provenance = {}
    if collect_provenance:
        provenance = _assemble_provenance(
            node_count=node_count,
            bins_list=bins_list,
            assembly_graph=assembly_graph,
            initial_contig_to_bin=initial_contig_to_bin,
            seed_contig_to_bin=seed_contig_to_bin,
            final_bins=final_bins,
            strip_reason=strip_reason,
            remove_labels_post=set(remove_labels),
            locked=locked,
            non_isolated=set(non_isolated),
            lp_provenance=lp_provenance,
            lp_iterations=lp_iterations,
            lp_converged=lp_converged,
        )

    return final_bins, remove_labels_initial, non_isolated, misbinned, ambiguous, provenance


def _assemble_provenance(
    node_count,
    bins_list,
    assembly_graph,
    initial_contig_to_bin,
    seed_contig_to_bin,
    final_bins,
    strip_reason,
    remove_labels_post,
    locked,
    non_isolated,
    lp_provenance,
    lp_iterations,
    lp_converged,
):
    """Build the per-contig decision record exported to GraphBin-Viz."""

    seeds = set(seed_contig_to_bin.keys())
    hop = _hop_distance_from_seeds(assembly_graph, seeds, node_count)

    # Label propagation works with 1-based label ids; translate them back into
    # the bin names the rest of the pipeline (and the interface) uses.
    def _lp_label_to_bin(value):
        try:
            idx = int(value) - 1
        except (TypeError, ValueError):
            return str(value)
        if 0 <= idx < len(bins_list):
            return bins_list[idx]
        return str(value)

    # Bins of the *seeds* that propagation actually ran from, and the bins of
    # the final assignment; the panel shows the second, which is what an
    # analyst is comparing against.
    seed_bin_by_contig = {
        contig: bins_list[b] if b < len(bins_list) else str(b)
        for contig, b in seed_contig_to_bin.items()
    }

    records = {}

    for contig in range(node_count):
        initial_bin_idx = initial_contig_to_bin.get(contig)
        final_bin = final_bins.get(contig)

        lp_rec = lp_provenance.get(contig) or lp_provenance.get(str(contig)) or {}

        if contig in locked:
            stage = STAGE_LOCKED
        elif contig in remove_labels_post:
            stage = STAGE_STRIPPED_POST
        elif contig in seeds and final_bin is not None:
            stage = STAGE_SEED
        elif final_bin is not None:
            stage = STAGE_PROPAGATED
        elif contig in strip_reason:
            stage = strip_reason[contig]
        else:
            stage = STAGE_UNRESOLVED

        # Confidence: seeds and locked assignments are certain by construction.
        # Propagated assignments combine the vote margin with a distance decay,
        # so a label carried a long way through the graph is trusted less.
        if stage in (STAGE_SEED, STAGE_LOCKED):
            margin = 1.0
            entropy = 0.0
            confidence = 1.0
        else:
            margin = float(lp_rec.get("margin", 0.0) or 0.0)
            entropy = float(lp_rec.get("entropy", 0.0) or 0.0)
            d = hop.get(contig)
            decay = 1.0 / (1.0 + float(d)) if d is not None else 0.0
            if final_bin is None:
                confidence = 0.0
            else:
                confidence = round(margin * (0.5 + 0.5 * decay), 6)

        neighbour_bins = _neighbour_bin_counts(assembly_graph, contig, final_bins)
        seed_neighbour_bins = _neighbour_bin_counts(
            assembly_graph, contig, seed_bin_by_contig
        )

        # A contig whose initial label was rejected and then re-inferred ends up
        # staged as "propagated"; record the rejection separately so the interface
        # can still explain that its original label was contradicted.
        was_stripped = contig in strip_reason
        record = {
            "stage": stage,
            "was_stripped": was_stripped,
            "strip_reason": strip_reason.get(contig),
            "initial_bin": bins_list[initial_bin_idx]
            if initial_bin_idx is not None and initial_bin_idx < len(bins_list)
            else None,
            "final_bin": final_bin,
            "hop": hop.get(contig),
            "margin": round(margin, 6),
            "entropy": round(entropy, 6),
            "confidence": confidence,
            "in_propagation": contig in non_isolated,
            "neighbour_bins": neighbour_bins,
            "seed_neighbour_bins": seed_neighbour_bins,
        }

        if lp_rec:
            record["scores"] = [
                [_lp_label_to_bin(label), val] for (label, val) in lp_rec.get("scores", [])
            ]
            record["support"] = [
                [int(src), val] for (src, val) in lp_rec.get("support", [])
            ]
            record["n_support"] = lp_rec.get("n_support", 0)
            record["first_iter"] = lp_rec.get("first_iter")
            record["history"] = [
                [it, _lp_label_to_bin(label)] for (it, label) in lp_rec.get("history", [])
            ]
            record["n_switches"] = lp_rec.get("n_switches", 0)

        records[contig] = record

    return {
        "records": records,
        "lp_iterations": lp_iterations,
        "lp_converged": bool(lp_converged),
        "n_seeds": len(seeds),
        "bins_list": list(bins_list),
    }


def write_provenance(provenance, path, name_for_contig):
    """Write the provenance record to JSON, keyed by contig name.

    `name_for_contig` maps a contig index to the contig name used everywhere
    else in the GraphBin outputs, so the interface can join this record against
    the assembly graph and the binning results without knowing the internal
    vertex numbering.
    """
    import json

    if not provenance:
        return

    records = provenance.get("records", {})
    named = {}

    for contig_idx, record in records.items():
        try:
            name = name_for_contig(contig_idx)
        except Exception:
            name = None
        if name is None:
            continue

        out = dict(record)

        # translate neighbour indices in the support list into contig names
        support = out.get("support")
        if support:
            translated = []
            for src_idx, value in support:
                try:
                    src_name = name_for_contig(src_idx)
                except Exception:
                    src_name = None
                if src_name is not None:
                    translated.append([src_name, value])
            out["support"] = translated

        named[name] = out

    payload = {
        "records": named,
        "lp_iterations": provenance.get("lp_iterations", 0),
        "lp_converged": provenance.get("lp_converged", False),
        "n_seeds": provenance.get("n_seeds", 0),
        "bins_list": provenance.get("bins_list", []),
        "stages": [
            STAGE_SEED,
            STAGE_LOCKED,
            STAGE_PROPAGATED,
            STAGE_STRIPPED_NEIGHBOUR,
            STAGE_STRIPPED_CLOSEST,
            STAGE_STRIPPED_POST,
            STAGE_UNRESOLVED,
        ],
    }

    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f)
