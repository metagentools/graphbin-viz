"""Tests for GraphBin-Viz's decision provenance and curation support.

These run without igraph by standing in a minimal graph object that provides
the only method GraphBin needs from it, `neighbors`.

    python3 -m unittest discover -s tests/python
"""

import json
import os
import sys
import tempfile
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, "public", "py"))
sys.path.insert(0, os.path.join(ROOT, "public", "py", "graphbin"))

from graphbin_Func import graphbin_main, write_provenance  # noqa: E402
from labelpropagation.labelprop import LabelProp  # noqa: E402
import export_common  # noqa: E402


class FakeGraph:
    """The subset of the igraph interface GraphBin actually uses."""

    def __init__(self, node_count, edges):
        self.adj = {i: set() for i in range(node_count)}
        for u, v in edges:
            self.adj[u].add(v)
            self.adj[v].add(u)

    def neighbors(self, node, mode="all"):
        return sorted(self.adj.get(node, ()))


# a chain joining two bins, with contig 5 deliberately mislabelled
CHAIN = [(0, 1), (1, 2), (2, 3), (3, 4), (4, 5), (5, 6), (6, 7), (7, 8), (8, 9),
         (9, 10), (10, 11)]
BINS = [[0, 1, 2, 5], [8, 9, 10, 11]]
BINS_LIST = ["bin_1", "bin_2"]


def run_refinement(**kwargs):
    graph = FakeGraph(12, CHAIN)
    return graphbin_main(
        2, [list(b) for b in BINS], list(BINS_LIST), graph, 12,
        1e-5, 50, min_bin_size=1, **kwargs
    )


class LabelPropagationProvenance(unittest.TestCase):
    def test_tracking_does_not_change_the_result(self):
        data = [[0, 1, [[1, 1.0]]], [1, 0, [[0, 1.0], [2, 1.0]]],
                [2, 0, [[1, 1.0], [3, 1.0]]], [3, 2, [[2, 1.0]]]]

        plain = LabelProp()
        plain.load_data_from_mem(data)
        without = sorted(plain.run(1e-5, 50))

        tracked = LabelProp()
        tracked.load_data_from_mem(data)
        with_tracking = sorted(tracked.run(1e-5, 50, track_provenance=True))

        self.assertEqual(without, with_tracking)

    def test_records_support_and_trajectory_for_inferred_labels(self):
        data = [[0, 1, [[1, 1.0]]], [1, 0, [[0, 1.0], [2, 1.0]]],
                [2, 0, [[1, 1.0], [3, 1.0]]], [3, 2, [[2, 1.0]]]]
        lp = LabelProp()
        lp.load_data_from_mem(data)
        lp.run(1e-5, 50, track_provenance=True)

        prov = lp.get_provenance()

        # seeded vertices are decided before propagation and carry no record
        self.assertNotIn(0, prov)
        self.assertNotIn(3, prov)

        record = prov[1]
        self.assertGreater(record["margin"], 0)
        self.assertEqual(record["first_iter"], 1)
        self.assertEqual([src for src, _ in record["support"]], [0, 2])
        self.assertEqual(record["n_support"], 2)
        self.assertTrue(0 <= record["entropy"] <= 1)

    def test_no_provenance_unless_requested(self):
        lp = LabelProp()
        lp.load_data_from_mem([[0, 1, [[1, 1.0]]], [1, 0, [[0, 1.0]]]])
        lp.run(1e-5, 10)
        self.assertEqual(lp.get_provenance(), {})


class RefinementProvenance(unittest.TestCase):
    def test_every_contig_gets_a_decision_record(self):
        *_, provenance = run_refinement()
        records = provenance["records"]

        self.assertEqual(len(records), 12)
        for contig, record in records.items():
            self.assertIn(record["stage"], {
                "seed", "locked", "propagated", "stripped_neighbour",
                "stripped_closest", "stripped_post", "unresolved",
            })
            self.assertTrue(0.0 <= record["confidence"] <= 1.0)

    def test_seeds_are_certain_and_propagated_labels_decay_with_distance(self):
        *_, provenance = run_refinement()
        records = provenance["records"]

        self.assertEqual(records[0]["stage"], "seed")
        self.assertEqual(records[0]["confidence"], 1.0)
        self.assertEqual(records[0]["hop"], 0)

        near, far = records[3], records[4]
        self.assertEqual(near["stage"], "propagated")
        self.assertEqual(far["stage"], "propagated")
        self.assertLess(near["hop"], far["hop"])
        self.assertGreater(near["confidence"], far["confidence"])

    def test_scores_and_history_use_bin_names_not_internal_ids(self):
        *_, provenance = run_refinement()
        record = provenance["records"][3]

        for name, _score in record["scores"]:
            self.assertIn(name, BINS_LIST)
        for _iteration, name in record["history"]:
            self.assertIn(name, BINS_LIST)

    def test_rejected_initial_labels_are_remembered(self):
        *_, provenance = run_refinement()
        # contig 5 sits in bin_1 but is surrounded by bin_2 territory
        record = provenance["records"][5]
        self.assertTrue(record["was_stripped"])
        self.assertEqual(record["initial_bin"], "bin_1")


class LockedAssignments(unittest.TestCase):
    def test_locked_contigs_are_honoured_and_propagate(self):
        baseline, *_ = run_refinement()
        final_bins, *_rest, provenance = run_refinement(locked={5: 1})

        self.assertEqual(final_bins[5], "bin_2")
        self.assertEqual(provenance["records"][5]["stage"], "locked")
        self.assertEqual(provenance["records"][5]["confidence"], 1.0)

        # the correction is not cosmetic: it changes neighbouring assignments too
        knock_on = [
            c for c in final_bins
            if c != 5 and baseline.get(c) != final_bins.get(c)
        ]
        self.assertTrue(knock_on)


class ProvenanceSerialisation(unittest.TestCase):
    def test_records_are_written_keyed_by_contig_name(self):
        *_, provenance = run_refinement()

        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "prov.json")
            write_provenance(provenance, path, lambda c: f"NODE_{c}_length_10_cov_1.0")
            with open(path, encoding="utf-8") as f:
                payload = json.load(f)

        self.assertIn("NODE_3_length_10_cov_1.0", payload["records"])
        record = payload["records"]["NODE_3_length_10_cov_1.0"]
        for src, _weight in record["support"]:
            self.assertTrue(src.startswith("NODE_"))


class CrossResultComparison(unittest.TestCase):
    def test_agreement_is_measured_over_result_pairs(self):
        keys = ["r0", "r1", "r2"]

        same = export_common.compare_assignments({k: "b1" for k in keys}, keys)
        self.assertEqual(same["n_distinct"], 1)
        self.assertEqual(same["disagreement"], 0.0)
        self.assertEqual(same["consensus_bin"], "b1")

        split = export_common.compare_assignments(
            {"r0": "b1", "r1": "b2", "r2": "b1"}, keys
        )
        self.assertEqual(split["n_distinct"], 2)
        self.assertAlmostEqual(split["disagreement"], 2 / 3, places=5)
        self.assertEqual(split["consensus_bin"], "b1")

        total = export_common.compare_assignments(
            {"r0": "b1", "r1": "b2", "r2": "b3"}, keys
        )
        self.assertEqual(total["disagreement"], 1.0)

    def test_unbinned_is_not_a_disagreement(self):
        """A result that left a contig unbinned has no opinion to conflict."""
        keys = ["r0", "r1"]

        # one tool bins it, the other never did: nothing to disagree about
        newly_binned = export_common.compare_assignments({"r0": None, "r1": "b1"}, keys)
        self.assertEqual(newly_binned["disagreement"], 0.0)
        self.assertEqual(newly_binned["n_assigned"], 1)
        self.assertEqual(newly_binned["consensus_bin"], "b1")

        # both bin it, in different bins: a real conflict
        conflict = export_common.compare_assignments({"r0": "b1", "r1": "b2"}, keys)
        self.assertEqual(conflict["disagreement"], 1.0)
        self.assertEqual(conflict["n_assigned"], 2)

        # nobody binned it
        unbinned = export_common.compare_assignments({"r0": None, "r1": None}, keys)
        self.assertEqual(unbinned["disagreement"], 0.0)
        self.assertEqual(unbinned["n_assigned"], 0)
        self.assertIsNone(unbinned["consensus_bin"])

    def test_disagreement_ignores_results_that_did_not_bin_it(self):
        keys = ["r0", "r1", "r2"]

        # two of three agree, the third left it unbinned: no disagreement
        result = export_common.compare_assignments(
            {"r0": "b1", "r1": "b1", "r2": None}, keys
        )
        self.assertEqual(result["disagreement"], 0.0)
        self.assertEqual(result["n_assigned"], 2)
        self.assertEqual(result["consensus_frac"], 1.0)

        # two of three bin it differently: the pair that assigned it conflicts
        split = export_common.compare_assignments(
            {"r0": "b1", "r1": "b2", "r2": None}, keys
        )
        self.assertEqual(split["disagreement"], 1.0)
        self.assertEqual(split["n_assigned"], 2)

    def test_result_specs_accept_extra_binning_results(self):
        from types import SimpleNamespace

        with tempfile.TemporaryDirectory() as tmp:
            extra = os.path.join(tmp, "rival.csv")
            with open(extra, "w", encoding="utf-8") as f:
                f.write("NODE_1,b1\n")

            specs = export_common.build_result_specs(SimpleNamespace(
                initial="a.csv", final="b.csv", delimiter=",",
                results=[{"name": "Rival", "path": extra}],
            ))

        self.assertEqual([s["key"] for s in specs], ["r0", "r1", "r2"])
        self.assertEqual([s["kind"] for s in specs], ["initial", "graphbin", "other"])
        self.assertEqual(specs[2]["name"], "Rival")

    def test_missing_extra_results_are_skipped(self):
        from types import SimpleNamespace

        specs = export_common.build_result_specs(SimpleNamespace(
            initial="a.csv", final="b.csv", delimiter=",",
            results=[{"name": "Missing", "path": "/no/such/file.csv"}],
        ))
        self.assertEqual(len(specs), 2)


if __name__ == "__main__":
    unittest.main()
