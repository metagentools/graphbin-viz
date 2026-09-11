#!/usr/bin/env python3

"""graphbin_MEGAHIT.py: Refined binning of metagenomic contigs using MEGAHIT assembly graphs.

GraphBin is a metagenomic contig binning tool that makes use of the contig 
connectivity information from the assembly graph to bin contigs. It utilizes 
the binning result of an existing binning tool and a label propagation algorithm 
to correct mis-binned contigs and predict the labels of contigs which are 
discarded due to short length.

graphbin_MEGAHIT.py makes use of the assembly graphs produced by MEGAHIT assembler.
"""

import logging
import time

try:
    import js  # type: ignore
except Exception:
    js = None

from graphbin_Func import graphbin_main, write_provenance
from parsers import get_initial_bin_count
from parsers.megahit_parser import (
    get_contig_descriptors,
    get_initial_binning_result,
    parse_graph,
    write_output,
)


__author__ = "Vijini Mallawaarachchi"
__copyright__ = "Copyright 2019-2022, GraphBin Project"
__credits__ = ["Vijini Mallawaarachchi", "Anuradha Wickramarachchi", "Yu Lin"]
__license__ = "BSD-3"
__version__ = "1.7.4"
__maintainer__ = "Vijini Mallawaarachchi"
__email__ = "viji.mallawaarachchi@gmail.com"
__status__ = "Production"


def run(args):
    start_time = time.time()

    assembly_graph_file = args.graph
    contigs_file = args.contigs
    contig_bins_file = args.binned
    output_path = args.output
    prefix = args.prefix
    delimiter = args.delimiter
    max_iteration = args.max_iteration
    diff_threshold = args.diff_threshold
    min_bin_size = getattr(args, "min_bin_size", 5)
    show_lp_log = getattr(args, "show_lp_log", False)

    # Setup logger
    logger = logging.getLogger(f"GraphBin {__version__}")
    logger.setLevel(logging.DEBUG)
    logger.propagate = False

    if logger.handlers:
        for h in list(logger.handlers):
            logger.removeHandler(h)

    formatter = logging.Formatter("%(asctime)s - %(levelname)s - %(message)s")
    consoleHeader = logging.StreamHandler()
    consoleHeader.setFormatter(formatter)
    consoleHeader.setLevel(logging.INFO)
    logger.addHandler(consoleHeader)

    fileHandler = logging.FileHandler(f"{output_path}{prefix}graphbin.log")
    fileHandler.setLevel(logging.DEBUG)
    fileHandler.setFormatter(formatter)
    logger.addHandler(fileHandler)

    if js is not None and hasattr(js, "graphbinLog"):
        class _JsLogHandler(logging.Handler):
            def emit(self, record):
                try:
                    msg = self.format(record)
                    js.graphbinLog(msg)
                except Exception:
                    pass

        js_handler = _JsLogHandler()
        js_handler.setLevel(logging.INFO)
        js_handler.setFormatter(formatter)
        logger.addHandler(js_handler)

    logger.info(
        "Welcome to GraphBin: Refined Binning of Metagenomic Contigs using Assembly Graphs."
    )
    logger.info(
        "This version of GraphBin makes use of the assembly graph produced by MEGAHIT which is based on the de Bruijn graph approach."
    )

    logger.info("Input arguments:")
    logger.info(f"Assembly graph file: {assembly_graph_file}")
    logger.info(f"Contigs file: {contigs_file}")
    logger.info(f"Existing binning output file: {contig_bins_file}")
    logger.info(f"Final binning output file: {output_path}")
    logger.info(f"Maximum number of iterations: {max_iteration}")
    logger.info(f"Difference threshold: {diff_threshold}")
    logger.info(f"Minimum bin size: {min_bin_size}")
    logger.info(f"Show label propagation log: {show_lp_log}")

    logger.info("GraphBin started")

    def _is_unbinned(value):
        if value is None:
            return True
        s = str(value).strip()
        if s == "":
            return True
        return s.lower() == "unbinned"

    # Get the number of bins from the initial binning result
    # --------------------------------------------------------

    n_bins, bins_list = get_initial_bin_count(contig_bins_file, delimiter)

    # Get original contig IDs
    # -------------------------------

    original_contigs = get_contig_descriptors(contigs_file)

    # Get assembly graph
    # --------------------

    assembly_graph, graph_to_contig_map, contigs_map, node_count = parse_graph(
        assembly_graph_file, original_contigs
    )

    # Get initial binning result
    # ----------------------------

    bins = get_initial_binning_result(
        n_bins,
        bins_list,
        contig_bins_file,
        contigs_map.inverse,
        graph_to_contig_map.inverse,
        delimiter,
    )

    initial_bin_by_contig = {}
    for idx, contigs in enumerate(bins):
        label = bins_list[idx]
        for contig in contigs:
            initial_bin_by_contig[contig] = label

    # Run GraphBin logic
    # -------------------------------------

    def _contig_label(contig_idx):
        segment_id = contigs_map[contig_idx]
        if segment_id in graph_to_contig_map:
            return graph_to_contig_map[segment_id]
        return None

    # Analyst-supplied locked assignments ({contig name: bin label}) arrive from
    # GraphBin-Viz when refinement is re-run under manual corrections.
    locked_named = getattr(args, "locked", None) or {}
    locked = {}
    if locked_named:
        bin_index = {label: idx for idx, label in enumerate(bins_list)}
        name_to_idx = {}
        for contig_idx in range(node_count):
            label = _contig_label(contig_idx)
            if label is not None:
                name_to_idx[label] = contig_idx
        for contig_label, bin_label in locked_named.items():
            if contig_label in name_to_idx and bin_label in bin_index:
                locked[name_to_idx[contig_label]] = bin_index[bin_label]
        logger.info(f"Received {len(locked)} locked assignment(s) from GraphBin-Viz")

    final_bins, remove_labels, non_isolated, _lp_misbinned, _ambiguous, provenance = graphbin_main(
        n_bins,
        bins,
        bins_list,
        assembly_graph,
        node_count,
        diff_threshold,
        max_iteration,
        min_bin_size,
        show_lp_log,
        locked=locked,
    )

    elapsed_time = time.time() - start_time

    # Print elapsed time for the process
    logger.info(f"Elapsed time: {elapsed_time} seconds")

    # Write misbinned contigs (changed bin between initial and final)
    misbinned = []
    for contig, init_label in initial_bin_by_contig.items():
        if _is_unbinned(init_label):
            continue
        final_label = final_bins.get(contig)
        if _is_unbinned(final_label):
            continue
        if final_label != init_label:
            segment_id = contigs_map[contig]
            if segment_id in graph_to_contig_map:
                misbinned.append(graph_to_contig_map[segment_id])

    misbinned_path = f"{output_path}{prefix}graphbin_misbinned.csv"
    try:
        with open(misbinned_path, "w", encoding="utf-8") as f:
            for contig in sorted(set(misbinned)):
                f.write(f"{contig}\n")
        logger.info(f"Misbinned contigs can be found at {misbinned_path}")
    except Exception as err:
        logger.warning(f"Failed to write misbinned contigs file: {err}")

    # Write ambiguous contigs (>=2 labelled neighbours in different bins, not misbinned)
    ambiguous_path = f"{output_path}{prefix}graphbin_ambiguous.csv"
    try:
        with open(ambiguous_path, "w", encoding="utf-8") as f:
            for contig in sorted(set(_ambiguous)):
                segment_id = contigs_map[contig]
                if segment_id in graph_to_contig_map:
                    f.write(f"{graph_to_contig_map[segment_id]}\n")
        logger.info(f"Ambiguous contigs can be found at {ambiguous_path}")
    except Exception as err:
        logger.warning(f"Failed to write ambiguous contigs file: {err}")

    # Write the decision provenance record consumed by GraphBin-Viz
    provenance_path = f"{output_path}{prefix}graphbin_provenance.json"
    try:
        write_provenance(provenance, provenance_path, _contig_label)
        logger.info(f"Decision provenance can be found at {provenance_path}")
    except Exception as err:
        logger.warning(f"Failed to write provenance file: {err}")

    # Write result to output file
    # -----------------------------

    write_output(
        output_path,
        prefix,
        final_bins,
        contigs_file,
        graph_to_contig_map,
        bins,
        contigs_map,
        bins_list,
        delimiter,
        node_count,
        remove_labels,
        non_isolated,
    )


def main(args):
    run(args)


if __name__ == "__main__":
    main()
