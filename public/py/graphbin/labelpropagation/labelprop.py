#!/usr/bin/env python3

"""
This code has been modified from the source found at https://github.com/ZwEin27/python-labelpropagation

GraphBin-Viz extension
----------------------
This module additionally records *decision provenance* for every vertex whose
label is inferred by propagation: the iteration at which its winning label was
first acquired, the full trajectory of label changes, the final score vector
over bins, and the per-neighbour contributions that produced the winning score.

The numerical behaviour of the propagation itself is unchanged; provenance is
recorded alongside it and is only assembled when `track_provenance` is set.
"""

import logging
import math


__author__ = "Vijini Mallawaarachchi"
__copyright__ = "Copyright 2019-2022, GraphBin Project"
__credits__ = ["Lingzhe Teng", "Vijini Mallawaarachchi"]
__license__ = "BSD-3"
__version__ = "1.7.4"
__maintainer__ = "Vijini Mallawaarachchi"
__email__ = "viji.mallawaarachchi@gmail.com"
__status__ = "Production"

# create logger
logger = logging.getLogger(f"GraphBin {__version__}")

# how many competing bins to retain per vertex in the exported score vector
TOP_K_SCORES = 5
# how many contributing neighbours to retain per vertex
TOP_K_SUPPORT = 8


class Edge:
    def __init__(self, src, dest, weight):
        self.src = src
        self.dest = dest
        self.weight = weight


class LabelProp:
    def __init__(self):
        self.logger = logging.getLogger(f"GraphBin {__version__}")
        self.logger.info("Creating an instance of LabelProp")
        self.initialize_env()

    ################################################################################
    #   Prepare Data
    ################################################################################

    def initialize_env(self):
        self.vertex_adj_map = {}  # int: [Edge]
        self.vertex_in_adj_map = {}  # int: float
        self.vertex_deg_map = {}  # int, float
        self.vertex_label_map = {}  # int, int
        self.label_index_map = {}  # int, int
        self.vertex_f_map = {}  # int, [float]
        self.vertex_size = 0
        self.label_size = 0
        self.labelled_size = 0

        # --- provenance state (GraphBin-Viz) ---
        self.track_provenance = False
        self.iterations_run = 0
        self.label_history = {}  # vertex -> [[iteration, label_index], ...]
        self.first_labelled_iter = {}  # vertex -> iteration best label became non-zero
        self.converged = False
        self.final_diff = None

    def setup_env(self):
        # initialize vertex_in_adj_map
        for vertex_id in self.vertex_adj_map.keys():
            if vertex_id not in self.vertex_in_adj_map:
                self.vertex_in_adj_map.setdefault(vertex_id, [])

        # setup vertex_in_adj_map
        for vertex_id in self.vertex_in_adj_map.keys():
            for edge in self.vertex_adj_map[vertex_id]:
                self.vertex_in_adj_map[edge.dest].append(edge)

        # setup vertex_deg_map
        for vertex_id in self.vertex_adj_map.keys():
            degree = 0.0
            if vertex_id in self.vertex_deg_map:
                degree = self.vertex_deg_map[vertex_id]
            for edge in self.vertex_adj_map[vertex_id]:
                degree += edge.weight
            self.vertex_deg_map[vertex_id] = degree

        # setup vertex_f_map
        v_set = self.vertex_label_map.keys()
        l_set = self.vertex_label_map.values()
        l_set = list(set(l_set))
        l_set.sort()

        label_enum = 0
        for l in l_set:
            if int(l) == 0:
                continue
            self.label_index_map[l] = label_enum
            label_enum += 1
        self.label_size = label_enum

        self.labelled_size = 0
        for v in v_set:
            arr = []
            l = int(self.vertex_label_map[v])
            if l == 0:
                # unlabelled
                for i in range(label_enum):
                    arr.append(0.0)
            else:
                # labelled
                self.labelled_size += 1
                ix = int(self.label_index_map[self.vertex_label_map[v]])
                for i in range(label_enum):
                    if i == ix:
                        arr.append(1.0)
                    else:
                        arr.append(0.0)
            self.vertex_f_map.setdefault(v, arr)

    def load_data_from_mem(self, data):
        self.initialize_env()
        self.vertex_size = len(data)
        for line in data:
            self.process_data_line(line)
        self.setup_env()

    def process_data_line(self, line):
        # [vertexId, vertexLabel, [edges]]
        # unlabeled vertex if vertexLabel == 0
        # i.e. [2, 1, [[1, 1.0], [3, 1.0]]]

        vertex_id = line[0]
        vertex_label = line[1]
        edges = line[2]
        edge_list = []
        self.vertex_label_map.setdefault(vertex_id, vertex_label)
        for edge in edges:
            dest_vertex_id = int(edge[0])
            edge_weight = float(edge[1])
            edge_list.append(Edge(vertex_id, dest_vertex_id, edge_weight))
        self.vertex_adj_map.setdefault(vertex_id, edge_list)

    ################################################################################
    #   Label Propagation
    ################################################################################

    def debug(self, include_scores=False):
        labels = []
        for label in self.label_index_map.keys():
            labels.insert(int(self.label_index_map[label]), label)
        ans = []
        for vertex_id in self.vertex_f_map.keys():
            arr = self.vertex_f_map[vertex_id]
            max_f_val = 0.0
            max_f_val_idx = 0

            im_ans = [vertex_id]
            for i in range(len(labels)):
                f_val = arr[i]
                if f_val > max_f_val:
                    max_f_val = f_val
                    max_f_val_idx = i
                if include_scores:
                    im_ans.append([labels[i], arr[i]])

            im_ans.insert(1, labels[max_f_val_idx])
            ans.append(im_ans)

        return ans

    def _best_label_index(self, arr):
        """Index of the winning label for a score vector, or None if all zero."""
        best_idx = None
        best_val = 0.0
        for i in range(len(arr)):
            if arr[i] > best_val:
                best_val = arr[i]
                best_idx = i
        return best_idx

    def _record_iteration(self, iteration):
        """Record label trajectory changes produced by this iteration."""
        for vertex_id, arr in self.vertex_f_map.items():
            if self.vertex_label_map.get(vertex_id):
                # seeded vertex: label fixed from the start
                continue

            best_idx = self._best_label_index(arr)
            if best_idx is None:
                continue

            history = self.label_history.get(vertex_id)
            if history is None:
                self.label_history[vertex_id] = [[iteration, best_idx]]
                self.first_labelled_iter[vertex_id] = iteration
            elif history[-1][1] != best_idx:
                history.append([iteration, best_idx])

    def iterate(self):
        next_vertex_f_map = {}  # int, [double]
        diff = 0

        for vertex_id in self.vertex_f_map.keys():
            if self.vertex_label_map[vertex_id]:  # skip labelled
                continue

            # update F(vertex_id) .. vertex_f_map
            next_f_value = []  # double
            f_values = self.vertex_f_map[vertex_id]

            for i in range(self.label_size):
                f_value = 0.0

                for edge in self.vertex_in_adj_map[vertex_id]:
                    weight = edge.weight
                    src = edge.src
                    deg = self.vertex_deg_map[vertex_id]
                    f_value += self.vertex_f_map[src][i] * (weight / deg)
                next_f_value.append(f_value)
                if self.vertex_label_map[vertex_id] == 0:
                    if f_value > f_values[i]:
                        diff += f_value - f_values[i]
                    else:
                        diff += f_values[i] - f_value
                next_vertex_f_map[vertex_id] = next_f_value

        for vertex_id in self.vertex_label_map.keys():
            if self.vertex_label_map[vertex_id] == 0:
                continue
            next_vertex_f_map[vertex_id] = self.vertex_f_map[vertex_id]

        self.vertex_f_map = next_vertex_f_map

        return diff

    def run(self, eps, max_iter, show_log=False, clean_result=False,
            track_provenance=False):
        self.track_provenance = bool(track_provenance)
        diff = 0.0
        i = 0
        for i in range(max_iter):
            logger.debug("Iteration " + str(i + 1))
            diff = self.iterate()
            if self.track_provenance:
                self._record_iteration(i + 1)
            if diff < eps:
                self.converged = True
                break

        self.iterations_run = i + 1
        self.final_diff = diff

        if show_log:
            self.show_detail(diff, eps, i, max_iter)

        # Return compact results by default: [vertex_id, best_label]
        # Detailed per-label score vectors are built only when explicitly required.
        ans = self.debug(include_scores=clean_result)

        if clean_result:
            rtn_cleaned = []
            for line in ans:
                try:
                    score = sum([float(_[1]) for _ in line[2:]])
                    if score:
                        rtn_cleaned.append([line[0], line[1], score])
                except Exception as e:
                    raise Exception("r")
            ans = rtn_cleaned
        return ans

    ################################################################################
    #   Provenance (GraphBin-Viz)
    ################################################################################

    def _labels_by_index(self):
        labels = [None] * self.label_size
        for label, idx in self.label_index_map.items():
            labels[int(idx)] = label
        return labels

    def get_provenance(self):
        """Assemble a per-vertex record explaining how its label was decided.

        Returns {vertex_id: {...}} with, for each propagated vertex:
          scores        top-K [label, score] pairs from the final score vector
          margin        (top - runner_up) / top, in [0, 1]; 1.0 = uncontested
          entropy       normalised Shannon entropy of the score vector, in [0, 1]
          support       top-K [neighbour_id, contribution] for the winning label
          n_support     number of neighbours with non-zero contribution
          first_iter    iteration at which the winning label was first acquired
          history       [[iteration, label], ...] label trajectory
          n_switches    number of times the winning label changed
        """
        if not self.track_provenance:
            return {}

        labels = self._labels_by_index()
        out = {}

        for vertex_id, arr in self.vertex_f_map.items():
            if self.vertex_label_map.get(vertex_id):
                continue  # seeded vertex, decided before propagation

            total = 0.0
            for value in arr:
                total += value

            ranked = sorted(
                ((arr[i], i) for i in range(len(arr))),
                key=lambda pair: pair[0],
                reverse=True,
            )
            if not ranked or ranked[0][0] <= 0.0:
                # never reached by any label
                out[vertex_id] = {
                    "scores": [],
                    "margin": 0.0,
                    "entropy": 0.0,
                    "support": [],
                    "n_support": 0,
                    "first_iter": None,
                    "history": [],
                    "n_switches": 0,
                }
                continue

            top_val, top_idx = ranked[0]
            runner_up = ranked[1][0] if len(ranked) > 1 else 0.0
            margin = (top_val - runner_up) / top_val if top_val > 0 else 0.0

            # normalised Shannon entropy over the score distribution
            entropy = 0.0
            if total > 0 and self.label_size > 1:
                for value in arr:
                    if value > 0:
                        p = value / total
                        entropy -= p * math.log(p)
                entropy = entropy / math.log(self.label_size)

            scores = [
                [labels[idx], round(val, 8)]
                for (val, idx) in ranked[:TOP_K_SCORES]
                if val > 0
            ]

            # per-neighbour contribution to the winning label
            deg = self.vertex_deg_map.get(vertex_id, 0.0)
            contributions = []
            if deg > 0:
                for edge in self.vertex_in_adj_map.get(vertex_id, []):
                    src = edge.src
                    src_scores = self.vertex_f_map.get(src)
                    if not src_scores:
                        continue
                    contribution = src_scores[top_idx] * (edge.weight / deg)
                    if contribution > 0:
                        contributions.append([src, round(contribution, 8)])
            contributions.sort(key=lambda pair: pair[1], reverse=True)

            history = [
                [it, labels[idx]] for (it, idx) in self.label_history.get(vertex_id, [])
            ]

            out[vertex_id] = {
                "scores": scores,
                "margin": round(margin, 6),
                "entropy": round(entropy, 6),
                "support": contributions[:TOP_K_SUPPORT],
                "n_support": len(contributions),
                "first_iter": self.first_labelled_iter.get(vertex_id),
                "history": history,
                "n_switches": max(0, len(history) - 1),
            }

        return out

    ################################################################################
    #   Show Info.
    ################################################################################

    def show_detail(self, diff, eps, i, max_iter):
        logger.info("Total number of vertices:\t\t" + str(self.vertex_size))
        logger.info("Number of class labels:\t\t" + str(self.label_size))
        logger.info(
            "Previous number of unlabeled vertices:\t"
            + str(self.vertex_size - self.labelled_size)
        )
        logger.info("Previous number of labeled vertices:\t" + str(self.labelled_size))
        logger.info("Value of eps parameter:\t\t" + str(eps))
        logger.info("Value of max_iteration parameter:\t" + str(max_iter))
        logger.info("Final values:")
        logger.info("iter = " + str(i + 1) + ", diff = " + str(diff))

    def show_vertex_adj(self):
        for k, v in self.vertex_adj_map.items():
            logger.debug(str([4, [[_.src, _.dest, _.weight] for _ in v]]))
