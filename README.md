<p align="center">
  <img src="https://raw.githubusercontent.com/metagentools/graphbin-viz/main/public/GraphBin-Viz_logo_light.png#gh-light-mode-only" width="400" title="GraphBin-Viz logo" alt="GraphBin-Viz logo">
  <img src="https://raw.githubusercontent.com/metagentools/graphbin-viz/main/public/GraphBin-Viz_logo_dark.png#gh-dark-mode-only" width="400" title="GraphBin-Viz logo" alt="GraphBin-Viz logo">
</p>

# GraphBin-Viz: Interactive Visual Analytics for Exploring Graph-based Metagenomic Binning

![GitHub License](https://img.shields.io/github/license/metagentools/graphbin-viz)
[![Unit Testing](https://github.com/metagentools/graphbin-viz/actions/workflows/vitest.yml/badge.svg)](https://github.com/metagentools/graphbin-viz/actions/workflows/vitest.yml)
[![E2E Testing](https://github.com/metagentools/graphbin-viz/actions/workflows/playwright.yml/badge.svg)](https://github.com/metagentools/graphbin-viz/actions/workflows/playwright.yml)

GraphBin-Viz is a **browser-based interactive visual analytics framework** for exploring and comparing **initial metagenomic binning results** and **[GraphBin](https://github.com/metagentools/GraphBin)-refined binning results** on assembly graphs. It runs [GraphBin](https://github.com/metagentools/GraphBin) locally on your device using your provided data, and no data ever leaves your device.


This project uses Pyodide (Python compiled to WebAssembly) to run GraphBin, visualisation, and plotting code entirely in the browser, no backend is needed.

## Web App (Anyone can use)

🌐 Live demo:
[metagentools.github.io/graphbin-viz/](https://metagentools.github.io/graphbin-viz/)

No installation needed! Python **not required**. Node.js **not required**. You only need a modern browser such as Chrome, Firefox, Safari or Edge.

## Features

### GraphBin bin-refinement

* Run GraphBin on your device using WebAssembly
* No shell installations needed
* Upload your own data and run
* Supports SPAdes assemblies (GFA, contigs FASTA and contig paths) and MEGAHIT assemblies (converted GFA, contigs FASTA)
* Upload initial binning result and assembly files
* Adjust GraphBin settings

### Coordinated workspace

The assembly graph, the contig feature space and the flow between binning
results are shown **together** in a single workspace and share one selection.
Brushing contigs in the feature space, clicking a flow, or clicking a contig in
the graph highlights the same contigs everywhere, so a group of interest can be
followed between graph structure and sequence composition without losing it.

Encoding and filtering sit in a toolbar above the graph rather than in a side
rail, the legend sits on the graph it explains, and the lower views collapse so
the graph can take the full panel.

### Where to start on a fresh result

With nothing selected, the inspector summarises the run rather than sitting
empty: how many contigs refinement kept, inferred or unlabelled; the confidence
distribution of the refined assignments; and a **needs attention** list of the
contigs the results disagree about or that were decided with the least support.
Every part of it is a way in - clicking a stage, a confidence band or a listed
contig selects it across all three views.

### Decision provenance: why a contig ended up where it did

GraphBin-Viz records how every contig's bin was decided during refinement, and
reports it per contig:

* **Decision stage** - whether the initial label was kept as a propagation seed,
  removed because the graph neighbourhood contradicted it, inferred by label
  propagation, or never resolvable
* **Rejected initial labels** - if a contig's original bin was contradicted and
  later re-inferred, the rejection and its reason are still shown
* **Supporting contigs** - the labelled neighbours that contributed to the
  winning score, with their weights, each selectable in the graph
* **Competing bins** - the full score distribution, the winning margin, and the
  neighbourhood entropy
* **Distance to evidence** - hop distance to the nearest seeded contig
* **Propagation replay** - a slider and play control that step through label
  propagation so you can watch labels spread outwards from the seeds, iteration
  by iteration, at an adjustable speed. During playback the markers that
  describe the *finished* result (what changed, GraphBin's flags) are hidden,
  so the only thing moving is the labels themselves

### Confidence and disagreement as first-class encodings

* A per-contig **confidence** combining the vote margin with distance decay, so a
  label carried a long way through the graph is trusted less
* Contigs can be coloured by **refinement confidence**, **cross-result
  disagreement**, **decision stage**, or any sequence feature; under the
  confidence channel the least well-supported assignments are the ones that
  stand out
* Filters for **only disputed** and **only low confidence** contigs, to go
  straight to the parts of the assembly worth checking

### Comparing any number of binning results

GraphBin is treated as one labelled result among several rather than as the
final answer. Supply additional binning results over the same assembly
(one CSV/TSV per tool) and GraphBin-Viz will:

* Add each as another column in the graph view, the flow diagram and the
  per-contig record
* Compute per-contig **consensus** and **disagreement** across all results
* Render a multi-stage flow diagram across every result in order

### Curation: correct an assignment and re-run refinement

Assignments are not read-only. Select contigs, lock them to a bin, and re-run
refinement: locked contigs are treated as **fixed seeds**, so the correction
propagates through the assembly graph rather than being a cosmetic relabelling
of one contig. The curated binning can be exported as CSV.

### Contig feature space

* Node size by contig length, coverage or degree
* A brushable GC x coverage scatter (also length and confidence) linked to the
  graph, so composition-based and graph-based views of the same contigs can be
  compared directly

### Static plots

* Publication-ready renderings of the same layout used in the workspace
* Adjustable plot settings: DPI, width / height, vertex size, label size, image type
* Download generated plots

### General

* Built-in test data for instant demonstration
* Client-side file handling - your data never leaves your computer
* Pure static site - works on GitHub Pages

## Technologies Used

* Pyodide (Python → WebAssembly)
* igraph (GraphBin + graph processing + plotting)
* matplotlib (Pyodide backend) for static image generation
* React (UI framework)
* Vite (build tooling)
* D3.js (interactive visualization + Sankey)
* HTML5/CSS3 user interface
* Vitest (unit testing)
* Playwright (E2E testing)

## Running the App Locally (Advanced)

Clone the repository:

```shell
git clone https://github.com/metagentools/graphbin-viz.git
cd graphbin-viz
```

Because the browser cannot fetch local files with `file:///`, you must serve it with a local server. You will need Node.js for this step. Check here for instructions to setup [Node.js](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm). Then run the following commands.

```shell
npm install
npm run build
npm run preview 
```

Then copy and paste the link shown as "Local:" in your web browser. It will look something like this.
```shell
http://localhost:4173/graphbin-viz/
```

## Running the Tests

```shell
npm run test:unit                          # component tests (Vitest)
npm run test:e2e                           # workspace tests (Playwright)
python3 -m unittest discover -s tests/python   # refinement + provenance tests
```

The Python tests cover label propagation provenance, the confidence and
cross-result agreement calculations, and the locked-assignment path. They stand
in a minimal graph object, so igraph is not required to run them.

## Benchmarking Different Datasets

This repo includes a Playwright benchmark pipeline that records timing metrics per dataset run to CSV.

### Configure datasets and run counts

Edit `tests/bench/datasets.manifest.json` file and add your datasets.

```json
{
  "runs": { "cold": 1, "warm": 3 },
  "datasets": [
    { "name": "bundled-example", "mode": "example", "assembler": "spades" },
    {
      "name": "my-upload-dataset",
      "mode": "upload",
      "assembler": "spades",
      "graph": "/absolute/or/relative/path/to/assembly_graph.gfa",
      "contigs": "/absolute/or/relative/path/to/contigs.fasta",
      "paths": "/absolute/or/relative/path/to/contigs.paths",
      "initial": "/absolute/or/relative/path/to/initial_binning.csv",
      "delimiter": ","
    }
  ]
}
```

`cold` runs start from a fresh page load; `warm` runs repeat without reloading.
Set `assembler` to `spades` or `megahit`. For `megahit`, `paths` is not required.

### Run benchmark

```shell
npm run test:e2e:bench
```

### Output

Results are appended to: `tests/bench/results/benchmark-results.csv`

Each row includes:
* dataset metadata
* assembler
* phase timings (`pyodide_init`, `input_load`, `graphbin`, `visualize`, `layout`, `interactive_prepare`, `interactive_render_ready`)
* total time
* graph size / contig count metadata
* browser, host, commit hash, and errors (if any)

Optional environment overrides:

* `BENCHMARK_MANIFEST` (default: `tests/bench/datasets.manifest.json`)
* `BENCHMARK_OUTPUT` (default: `tests/bench/results/benchmark-results.csv`)
* `BENCHMARK_WAIT_TIMEOUT_MS` (default: `900000`)

### Plot benchmark CSV

Use the included plotting script to visualize timing against `nodes`, `graph_size_bytes`, and `contigs_size_bytes`:

```shell
python3 tests/bench/plot_benchmark_results.py \
  --input tests/bench/results/benchmark-results.csv \
  --output-dir tests/bench/results/plots
```

Generated files:
* `tests/bench/results/plots/run_level_total_vs_features.png`
* `tests/bench/results/plots/phase_timings_vs_features.png`
* `tests/bench/results/plots/dataset_medians.csv`

![Phase timings vs features](tests/bench/results/phase_timings_vs_features.png)

## Acknowledgement

This work is dedicated to the memory of the late [Dr Yu Lin](https://xuehansheng.github.io/Yu_CV_2022.pdf) ([The Computational Genomics Group](https://cgg-anu.github.io/) at The Australian National University) whose guidance and support were instrumental in shaping the work around GraphBin. His wisdom and mentorship will be deeply missed.

The development of this app was motivated by concepts described in the Wasm ABABCS2025 Workshop (doi: https://doi.org/10.5281/zenodo.17743837).

ChatGPT (OpenAI) was used as a development aid during front-end implementation for UI design iteration, component structuring, styling suggestions, and debugging support. All generated code and recommendations were reviewed, modified as needed, and validated by the project authors before integration.

## Citation

If you use this in your work, please cite GraphBin and GraphBin-Tk (full citations below).

> Vijini Mallawaarachchi, Anuradha Wickramarachchi, Yu Lin. GraphBin: Refined binning of metagenomic contigs using assembly graphs. Bioinformatics, Volume 36, Issue 11, June 2020, Pages 3307–3313, DOI: https://doi.org/10.1093/bioinformatics/btaa180

> Mallawaarachchi et al., (2025). GraphBin-Tk: assembly graph-based metagenomic binning toolkit. Journal of Open Source Software, 10(109), 7713, https://doi.org/10.21105/joss.07713

## Funding

This work is funded by an [Essential Open Source Software for Science 
Grant](https://chanzuckerberg.com/eoss/proposals/cogent3-python-apis-for-iq-tree-and-graphbin-via-a-plug-in-architecture/) 
from the Chan Zuckerberg Initiative.

<p align="left">
  <img src="https://chanzuckerberg.com/wp-content/themes/czi/img/logo.svg" width="300">
</p>
