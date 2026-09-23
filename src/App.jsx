import React, { useEffect, useRef, useState } from "react";
import { FluentProvider } from "@fluentui/react-provider";
import { webDarkTheme, webLightTheme } from "@fluentui/react-theme";
import { Button, ToggleButton } from "@fluentui/react-button";
import { Select } from "@fluentui/react-select";
import { Input } from "@fluentui/react-input";
import { Slider } from "@fluentui/react-slider";
import { Checkbox } from "@fluentui/react-checkbox";
import { Tab, TabList } from "@fluentui/react-tabs";
import { Tooltip } from "@fluentui/react-tooltip";
import { Label } from "@fluentui/react-label";
import { Badge } from "@fluentui/react-badge";
import { Spinner } from "@fluentui/react-spinner";
import { SkeletonItem } from "@fluentui/react-skeleton";
import {
  QuestionCircleRegular,
  WeatherMoonRegular,
  WeatherSunnyRegular,
} from "@fluentui/react-icons";

import { initApp, uiBridge } from "./app.js";

/* ---------------------------------------------------------------------
   Run signal.

   A run takes a while — Pyodide, the packages, then GraphBin itself — and
   several parts of the page want to shimmer while it is in flight. They
   subscribe individually rather than re-rendering App: the drawing code
   writes straight into #prov-panel, #bin-legend, #replay-hint and the
   selects, and a re-render of the tree that holds those would put React's
   version of their contents back.
   --------------------------------------------------------------------- */
const runListeners = new Set();
uiBridge.setRunning = (value) => {
  runListeners.forEach((listener) => listener(Boolean(value)));
};

function useRunning() {
  const [running, setRunning] = useState(false);
  useEffect(() => {
    runListeners.add(setRunning);
    return () => runListeners.delete(setRunning);
  }, []);
  return running;
}

/* Sliders register themselves here so the drawing code can drive them by id. */
const sliderSetters = new Map();
uiBridge.setSlider = (id, patch) => sliderSetters.get(id)?.(patch);

function useSliderState(id, initial) {
  const [state, setState] = useState(initial);
  // a patch, not a replacement: the drawing code sets a slider's value on its
  // own without restating the bounds it set earlier
  const patch = React.useCallback(
    (next) => setState((prev) => ({ ...prev, ...next })),
    []
  );
  useEffect(() => {
    sliderSetters.set(id, patch);
    return () => {
      if (sliderSetters.get(id) === patch) sliderSetters.delete(id);
    };
  }, [id, patch]);
  return [state, patch];
}

/* --------------------------------------------------------------------- */

function HelpTip({ label, children }) {
  return (
    <Tooltip content={children} relationship="description" withArrow>
      <Button
        className="help-btn"
        appearance="transparent"
        size="small"
        type="button"
        icon={<QuestionCircleRegular />}
        aria-label={label}
      />
    </Tooltip>
  );
}

function FieldLabel({ htmlFor, children, help, helpLabel }) {
  return (
    <div className="label-with-help">
      <Label htmlFor={htmlFor} size="small">
        {children}
      </Label>
      {help ? <HelpTip label={helpLabel}>{help}</HelpTip> : null}
    </div>
  );
}

/* ----------------------------- filter chips ----------------------------- */

const FILTERS = [
  { id: "toggle-only-disputed", text: "Tools disagree" },
  { id: "toggle-low-confidence", text: "Low confidence" },
  { id: "toggle-hide-unbinned", text: "Hide unbinned" },
  { id: "toggle-hide-isolated", text: "Hide isolated" },
];

const MARKERS = [
  { id: "toggle-mark-changed", text: "Changed by refinement" },
  { id: "toggle-mark-misbinned", text: "Likely misbinned" },
  { id: "toggle-mark-ambiguous", text: "Ambiguous" },
];

const ALL_TOGGLES = [...FILTERS, ...MARKERS];

/**
 * The filters and markers, as pressed/unpressed ToggleButtons.
 *
 * This holds the pressed state and the drawing code holds the filter state;
 * they are kept in step through uiBridge, which also lets "Reset view" put
 * every chip back up.
 */
function FilterToggles() {
  const [pressed, setPressed] = useState(() =>
    Object.fromEntries(ALL_TOGGLES.map((t) => [t.id, false]))
  );

  useEffect(() => {
    const apply = (patch) => setPressed((prev) => ({ ...prev, ...patch }));
    uiBridge.setToggles = apply;
    return () => {
      if (uiBridge.setToggles === apply) uiBridge.setToggles = null;
    };
  }, []);

  const toggle = (id) => {
    const next = !pressed[id];
    setPressed((prev) => ({ ...prev, [id]: next }));
    uiBridge.onToggle?.(id, next);
  };

  const chip = ({ id, text }) => (
    <ToggleButton
      key={id}
      id={id}
      className="chip"
      type="button"
      size="small"
      shape="circular"
      checked={pressed[id]}
      onClick={() => toggle(id)}
    >
      {text}
    </ToggleButton>
  );

  return (
    <>
      <span className="tb-chip-label">Show</span>
      {FILTERS.slice(0, 2).map(chip)}
      <span className="tb-chip-sep" aria-hidden="true"></span>
      {FILTERS.slice(2).map(chip)}
      <span className="tb-chip-sep" aria-hidden="true"></span>
      <span className="tb-chip-label">Mark</span>
      {MARKERS.map(chip)}
    </>
  );
}

/* ------------------------------- sliders ------------------------------- */

function NodeSizeSlider() {
  const [state, setState] = useSliderState("node-size", { value: 5.5 });

  return (
    <div className="range-row">
      <Slider
        id="node-size"
        size="small"
        min={2}
        max={16}
        step={0.5}
        value={state.value}
        onChange={(_, data) => {
          setState({ value: data.value });
          uiBridge.onSlider?.("node-size", data.value);
        }}
      />
      <span id="node-size-value" className="range-value">
        {state.value}
      </span>
    </div>
  );
}

function ReplaySlider() {
  const [state, setState] = useSliderState("replay-slider", {
    min: 0,
    max: 0,
    value: 0,
    disabled: true,
  });

  return (
    <Slider
      id="replay-slider"
      className="replay-slider"
      size="small"
      min={state.min}
      max={state.max}
      step={1}
      value={state.value}
      disabled={state.disabled || state.max === 0}
      onChange={(_, data) => {
        setState({ value: data.value });
        uiBridge.onSlider?.("replay-slider", data.value);
      }}
    />
  );
}

/* ------------------------------ run buttons ----------------------------- */

function RunButtons({ onRun }) {
  const running = useRunning();
  return (
    <div className="button-row">
      <Button
        id="run-btn"
        type="button"
        appearance="primary"
        disabled={running}
        icon={running ? <Spinner size="tiny" /> : undefined}
        onClick={onRun}
      >
        Plot binning results
      </Button>
      <Button
        id="example-btn"
        type="button"
        disabled={running}
        icon={running ? <Spinner size="tiny" /> : undefined}
        onClick={onRun}
      >
        Run example data
      </Button>
    </div>
  );
}

/* ------------------------------- shimmers ------------------------------- */

/**
 * A skeleton laid over a view while a run is in flight.
 *
 * It sits on top rather than replacing the view, because the canvas and the
 * SVGs belong to the drawing code and must stay in the document for it to
 * size them. Nothing here takes the pointer.
 *
 * One block that fills the frame, the way the static plots shimmer: a handful
 * of thin bars adrift in a tall empty panel reads as a broken render rather
 * than a pending one.
 */
function ViewShimmer({ className = "" }) {
  const running = useRunning();
  if (!running) return null;
  return (
    <div className={`shimmer-overlay ${className}`.trim()} aria-hidden="true">
      <SkeletonItem shape="rectangle" />
    </div>
  );
}

function InspectorShimmer() {
  const running = useRunning();
  if (!running) return null;
  return (
    <div className="shimmer-inspector" aria-hidden="true">
      <SkeletonItem shape="rectangle" size={40} />
      {Array.from({ length: 6 }, (_, i) => (
        <SkeletonItem key={i} shape="rectangle" size={16} />
      ))}
    </div>
  );
}

function PlotsShimmer() {
  const running = useRunning();
  if (!running) return null;
  return (
    <div className="shimmer-plots" aria-hidden="true">
      <SkeletonItem shape="rectangle" />
      <SkeletonItem shape="rectangle" />
    </div>
  );
}

/* --------------------------------- app --------------------------------- */

export default function App() {
  const [activeTab, setActiveTab] = useState("output");
  // Fluent theming is a prop, not a stylesheet, so the appearance lives in
  // state; data-theme stays on <html> for the app's own rules.
  const [appearance, setAppearance] = useState("light");
  const baseUrl = import.meta.env.BASE_URL || "/";
  const themeButtonRef = useRef(null);

  useEffect(() => {
    initApp();

    const root = document.documentElement;
    const toggleButton = document.getElementById("theme-toggle");
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const storageKey = "graphbin-theme";

    const getSystemTheme = () => (media.matches ? "dark" : "light");

    const applyTheme = (theme) => {
      root.dataset.theme = theme;
      root.style.colorScheme = theme;
      setAppearance(theme);

      if (toggleButton) {
        toggleButton.setAttribute(
          "aria-label",
          theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
        );
        toggleButton.setAttribute("aria-pressed", theme === "dark");
      }
    };

    const storedTheme = localStorage.getItem(storageKey);
    applyTheme(storedTheme || getSystemTheme());

    const handleToggle = () => {
      const nextTheme = root.dataset.theme === "dark" ? "light" : "dark";
      localStorage.setItem(storageKey, nextTheme);
      applyTheme(nextTheme);
    };

    const handleSystemChange = () => {
      if (!localStorage.getItem(storageKey)) {
        applyTheme(getSystemTheme());
      }
    };

    if (toggleButton) {
      toggleButton.addEventListener("click", handleToggle);
    }

    if (media.addEventListener) {
      media.addEventListener("change", handleSystemChange);
    } else {
      media.addListener(handleSystemChange);
    }

    return () => {
      if (toggleButton) {
        toggleButton.removeEventListener("click", handleToggle);
      }
      if (media.removeEventListener) {
        media.removeEventListener("change", handleSystemChange);
      } else {
        media.removeListener(handleSystemChange);
      }
    };
  }, []);

  useEffect(() => {
    const syncFlowPanelHeight = () => {
      if (activeTab !== "interactive") {
        return;
      }
      const panel = document.getElementById("panel-interactive");
      if (!panel) return;
      const h = panel.getBoundingClientRect().height;
      if (h > 0) {
        document.documentElement.style.setProperty(
          "--flow-panel-height",
          `${Math.round(h)}px`
        );
      }
    };

    const handleResize = () => {
      syncFlowPanelHeight();
    };

    window.addEventListener("resize", handleResize);

    let frame = null;
    if (activeTab !== "output") {
      frame = requestAnimationFrame(() => {
        window.dispatchEvent(new Event("resize"));
        syncFlowPanelHeight();
        // the workspace canvases can only be measured once visible
        window.dispatchEvent(new Event("graphbin-viz:workspace-shown"));
      });
    }

    return () => {
      window.removeEventListener("resize", handleResize);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [activeTab]);

  return (
    <FluentProvider
      className="app-provider"
      theme={appearance === "dark" ? webDarkTheme : webLightTheme}
    >
      <div className="app">
        <Button
          id="theme-toggle"
          className="theme-toggle"
          ref={themeButtonRef}
          type="button"
          shape="circular"
          icon={
            appearance === "dark" ? <WeatherMoonRegular /> : <WeatherSunnyRegular />
          }
          aria-label="Switch to dark mode"
          aria-pressed="false"
        />
        <header className="app-header">
          <h1>GraphBin-Viz</h1>
          <div className="title-subtitle">
            Interactive Visual Analytics for Exploring Graph-based Metagenomic
            Binning
          </div>
          <div className="intro-row">
            <div className="subtitle intro-copy">
              <div className="intro-card">
                <p className="intro-lede">
                  Refine and visualize your metagenomic binning results with{" "}
                  <a
                    href="https://github.com/metagentools/GraphBin"
                    target="_blank"
                    rel="noreferrer"
                  >
                    GraphBin
                  </a>{" "}
                  directly in your browser.
                </p>
                <p className="intro-body">
                  You can visualise and compare the binning results using the provided interactive views.
                  GraphBin runs locally on your device using your uploaded assembly graph + contigs +
                  initial binning result, and no data ever leaves your device.
                </p>
                <div className="intro-features" role="list">
                  <span className="intro-logo-inline" role="listitem">
                    <a
                      href="https://github.com/metagentools/GraphBin"
                      target="_blank"
                      rel="noreferrer"
                      className="logo-link"
                      aria-label="GraphBin on GitHub"
                    >
                      <span className="logo-swap" aria-hidden="true">
                        <img
                          src={`${baseUrl}GraphBin_logo_light.png`}
                          alt=""
                          className="graphbin-logo logo-light"
                        />
                        <img
                          src={`${baseUrl}GraphBin_logo_dark.png`}
                          alt=""
                          className="graphbin-logo logo-dark"
                        />
                      </span>
                    </a>
                  </span>
                  <Badge appearance="outline" color="informative" role="listitem">
                    Assembly graph visualization
                  </Badge>
                  <Badge appearance="outline" color="informative" role="listitem">
                    Interactive comparisons
                  </Badge>
                  <Badge appearance="outline" color="informative" role="listitem">
                    Local execution
                  </Badge>
                  <Badge appearance="outline" color="informative" role="listitem">
                    No data leaves your machine
                  </Badge>
                </div>
                <p className="intro-cta">
                  You can load your own data (click on the tooltips for more information about the files
                  to be uploaded) and click <b>Plot binning results</b>, or click{" "}
                  <b>Run example data</b> to see how it works on the provided example data.
                </p>
              </div>
            </div>
          </div>
        </header>

        <section className="panel">
          <div id="config-two-col">
            <div id="input-files-col">
              <div className="settings-title">Input Files</div>

              <div className="form-grid">
                <div className="form-row">
                  <FieldLabel
                    htmlFor="assembler"
                    helpLabel="Assembler help"
                    help="The assembler used to assemble your metagenomic sample"
                  >
                    Assembler
                  </FieldLabel>
                  <div className="control">
                    <Select id="assembler" defaultValue="spades">
                      <option value="spades">SPAdes</option>
                      <option value="megahit">MEGAHIT</option>
                    </Select>
                  </div>
                </div>

                <div className="form-row">
                  <FieldLabel
                    htmlFor="graph"
                    helpLabel="GFA file help"
                    help="The GFA file output from the assembler (< 200 MB)"
                  >
                    GFA file
                  </FieldLabel>
                  <div className="control">
                    <input id="graph" type="file" accept=".gfa" />
                  </div>
                </div>

                <div className="form-row">
                  <FieldLabel
                    htmlFor="contigs"
                    helpLabel="Contigs file help"
                    help="The contigs file (e.g., contigs.fasta from SPAdes) (< 200 MB and < 10,000 contigs)"
                  >
                    Contigs file
                  </FieldLabel>
                  <div className="control">
                    <input id="contigs" type="file" accept=".fasta,.fa,.fna" />
                  </div>
                </div>

                <div className="form-row" id="paths-row">
                  <FieldLabel
                    htmlFor="paths"
                    helpLabel="Paths file help"
                    help="The paths file of the contigs (e.g., contigs.paths from SPAdes). Not required for MEGAHIT."
                  >
                    Paths file
                  </FieldLabel>
                  <div className="control">
                    <input id="paths" type="file" />
                  </div>
                </div>

                <div className="form-row">
                  <FieldLabel
                    htmlFor="initial"
                    helpLabel="Initial binning result help"
                    help="The binning result from any existing metagenomic binning tool in CSV or TSV format (contig name, bin ID). GraphBin will refine this result."
                  >
                    Initial binning result
                  </FieldLabel>
                  <div className="control">
                    <input id="initial" type="file" accept=".csv,.tsv" />
                  </div>
                </div>

                <div className="form-row">
                  <FieldLabel
                    htmlFor="extra-results"
                    helpLabel="Other binning results help"
                    help="Optional. Additional binning results (CSV/TSV, one file per tool) over the same assembly. Each becomes another column in the comparison, so you can see where several binners agree, disagree, or are contradicted by the assembly graph."
                  >
                    Other binning results
                  </FieldLabel>
                  <div className="control">
                    <input id="extra-results" type="file" accept=".csv,.tsv" multiple />
                  </div>
                </div>

                <div className="form-row">
                  <FieldLabel
                    htmlFor="setting-delimiter"
                    helpLabel="Delimiter help"
                    help="Delimiter used in the binning results"
                  >
                    Delimiter
                  </FieldLabel>
                  <div className="control">
                    <Select id="setting-delimiter" defaultValue=",">
                      <option value=",">Comma (,)</option>
                      <option value="\t">Tab (\t)</option>
                    </Select>
                  </div>
                </div>
              </div>
            </div>

            <div id="settings-panel">
              <div className="settings-title">Plot Settings</div>

              <div className="form-grid">
                <div className="form-row">
                  <FieldLabel htmlFor="setting-dpi">DPI</FieldLabel>
                  <div className="control">
                    <Input type="number" id="setting-dpi" defaultValue="300" />
                  </div>
                </div>

                <div className="form-row">
                  <FieldLabel htmlFor="setting-width">Width (px)</FieldLabel>
                  <div className="control">
                    <Input type="number" id="setting-width" defaultValue="2000" />
                  </div>
                </div>

                <div className="form-row">
                  <FieldLabel htmlFor="setting-height">Height (px)</FieldLabel>
                  <div className="control">
                    <Input type="number" id="setting-height" defaultValue="2000" />
                  </div>
                </div>

                <div className="form-row">
                  <FieldLabel htmlFor="setting-vsize">Vertex Size</FieldLabel>
                  <div className="control">
                    <Input type="number" id="setting-vsize" defaultValue="50" />
                  </div>
                </div>

                <div className="form-row">
                  <FieldLabel htmlFor="setting-lsize">Label Size</FieldLabel>
                  <div className="control">
                    <Input type="number" id="setting-lsize" defaultValue="2" />
                  </div>
                </div>

                <div className="form-row">
                  <FieldLabel htmlFor="setting-imgtype">Image Type</FieldLabel>
                  <div className="control">
                    <Select id="setting-imgtype" defaultValue="png">
                      <option value="png">PNG</option>
                      <option value="svg">SVG</option>
                      <option value="pdf">PDF</option>
                    </Select>
                  </div>
                </div>
              </div>
            </div>

            <div className="settings-group settings-group-wide">
              <div className="settings-title">GraphBin Settings</div>
              <div className="form-grid two-col">
                <div className="form-grid">
                  <div className="form-row">
                    <FieldLabel
                      htmlFor="setting-max-iter"
                      helpLabel="Max Iterations help"
                      help="Maximum number of iterations for the label propagation"
                    >
                      Max Iterations
                    </FieldLabel>
                    <div className="control">
                      <Input
                        type="number"
                        id="setting-max-iter"
                        defaultValue="50"
                        min="1"
                      />
                    </div>
                  </div>

                  <div className="form-row">
                    <FieldLabel
                      htmlFor="setting-min-bin-size"
                      helpLabel="Minimum bin size help"
                      help="Minimum bin size to prevent bins from being removed during label correction"
                    >
                      Minimum bin size
                    </FieldLabel>
                    <div className="control">
                      <Input
                        type="number"
                        id="setting-min-bin-size"
                        defaultValue="5"
                        min="1"
                      />
                    </div>
                  </div>
                </div>

                <div className="form-grid">
                  <div className="form-row">
                    <FieldLabel
                      htmlFor="setting-diff-threshold"
                      helpLabel="Diff Threshold help"
                      help="Difference threshold to stop the label propagation"
                    >
                      Diff Threshold
                    </FieldLabel>
                    <div className="control">
                      <Input
                        type="number"
                        id="setting-diff-threshold"
                        defaultValue="0.00001"
                        step="0.000001"
                        min="0"
                      />
                    </div>
                  </div>

                  <div className="form-row">
                    <FieldLabel
                      htmlFor="setting-show-lp-log"
                      helpLabel="Show LP log help"
                      help="Show logs from label propagation"
                    >
                      Show LP log
                    </FieldLabel>
                    <div className="control">
                      <Select id="setting-show-lp-log" defaultValue="false">
                        <option value="false">No</option>
                        <option value="true">Yes</option>
                      </Select>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <RunButtons onRun={() => setActiveTab("output")} />
        </section>

        <section className="panel tab-shell">
          <div className="tab-header">
            <TabList
              selectedValue={activeTab}
              onTabSelect={(_, data) => setActiveTab(data.value)}
              aria-label="Views"
            >
              <Tab id="tab-output" value="output" aria-controls="panel-output">
                Run log &amp; exports
              </Tab>
              <Tab
                id="tab-interactive"
                value="interactive"
                aria-controls="panel-interactive"
              >
                Workspace
              </Tab>
            </TabList>
          </div>

          <div className="tab-panels">
            <div
              id="panel-interactive"
              className={`tab-panel ${activeTab === "interactive" ? "active" : ""}`}
              role="tabpanel"
              aria-labelledby="tab-interactive"
            >
              <div className="workspace" id="workspace">
                <div className="ws-main">
                  <div className="ws-main-head">
                    <span id="graph-view-title" className="settings-title">
                      Assembly graph
                    </span>
                    {/* view-level actions sit with the view's own title rather
                        than in the encoding toolbar, which they are not part of */}
                    <div className="ws-head-actions">
                      <Button id="reset-view" type="button" size="small">
                        Reset view
                      </Button>
                      <Button id="clear-selection" type="button" size="small">
                        Clear selection
                      </Button>
                      <Button
                        id="toggle-bottom-row"
                        type="button"
                        size="small"
                        appearance="transparent"
                      >
                        Hide lower views
                      </Button>
                    </div>
                  </div>

                  {/* ---------- toolbar: encoding + filtering ---------- */}
                  <div className="ws-toolbar">
                    <div className="tb-row">
                      <div className="tb-field">
                        <Label htmlFor="view-mode" size="small">
                          Result
                        </Label>
                        <Select id="view-mode" size="small" defaultValue="r0"></Select>
                      </div>

                      <div className="tb-field">
                        <Label htmlFor="color-mode" size="small">
                          Colour by
                        </Label>
                        <Select id="color-mode" size="small" defaultValue="bin">
                          <option value="bin">Bin assignment</option>
                          <option value="confidence">Refinement confidence</option>
                          <option value="disagreement">Cross-result disagreement</option>
                          <option value="stage">Decision stage</option>
                          <option value="cov">Coverage</option>
                          <option value="gc">GC content</option>
                          <option value="len">Contig length</option>
                        </Select>
                      </div>

                      <div className="tb-field">
                        <Label htmlFor="size-mode" size="small">
                          Size by
                        </Label>
                        <Select id="size-mode" size="small" defaultValue="uniform">
                          <option value="uniform">Uniform</option>
                          <option value="len">Contig length</option>
                          <option value="cov">Coverage</option>
                          <option value="degree">Degree</option>
                        </Select>
                      </div>

                      <div className="tb-field">
                        <Label htmlFor="bin-filter" size="small">
                          Show only bin
                        </Label>
                        <Select id="bin-filter" size="small">
                          <option value="">(all bins)</option>
                        </Select>
                      </div>

                      <div className="tb-field tb-field-range">
                        <Label htmlFor="node-size" size="small">
                          Node size
                        </Label>
                        <NodeSizeSlider />
                      </div>
                    </div>

                    <div className="tb-row tb-row-chips" role="group" aria-label="Filters">
                      <FilterToggles />
                    </div>
                  </div>

                  {/* ---------- graph ---------- */}
                  <div className="ws-graph">
                    <div className="interactive-canvas-wrap">
                      <canvas id="graph-canvas" width="900" height="640"></canvas>
                      <ViewShimmer className="shimmer-graph" />
                      <div
                        id="hover-tooltip"
                        className="tooltip"
                        style={{ display: "none" }}
                      ></div>
                      <div id="legend-overlay" className="legend-overlay">
                        <button
                          id="legend-toggle"
                          className="legend-overlay-head"
                          type="button"
                          aria-expanded="true"
                          aria-controls="bin-legend"
                        >
                          Legend
                        </button>
                        <div id="bin-legend" className="bin-legend"></div>
                      </div>
                    </div>

                    <div className="replay-bar">
                      <span className="replay-label">Propagation replay</span>
                      <Button id="replay-play" type="button" size="small">
                        Play
                      </Button>
                      <ReplaySlider />
                      <span id="replay-value" className="range-value">
                        off
                      </span>
                      <label className="replay-speed" htmlFor="replay-speed">
                        <span>Speed</span>
                        <Select id="replay-speed" size="small" defaultValue="600">
                          <option value="1600">Very slow</option>
                          <option value="1000">Slow</option>
                          <option value="600">Normal</option>
                          <option value="280">Fast</option>
                        </Select>
                      </label>
                      <span id="replay-hint" className="replay-hint">
                        Step through how labels spread outwards from the seeds.
                      </span>
                    </div>
                  </div>

                  {/* ---------- linked lower views ---------- */}
                  <div className="ws-bottom" id="ws-bottom">
                    <div className="ws-view ws-scatter">
                      <div className="ws-view-header">
                        <span className="ws-view-title">Feature space</span>
                        <div className="ws-view-controls">
                          <Select id="scatter-x" size="small" defaultValue="gc">
                            <option value="gc">GC %</option>
                            <option value="cov">Coverage</option>
                            <option value="len">Length</option>
                            <option value="confidence">Confidence</option>
                          </Select>
                          <Select id="scatter-y" size="small" defaultValue="cov">
                            <option value="cov">Coverage</option>
                            <option value="gc">GC %</option>
                            <option value="len">Length</option>
                            <option value="confidence">Confidence</option>
                          </Select>
                        </div>
                      </div>
                      <div className="scatter-wrap">
                        <svg
                          id="feature-scatter"
                          role="img"
                          aria-label="Contig feature scatter plot, brushable"
                        ></svg>
                        <ViewShimmer />
                        <div
                          id="scatter-tooltip"
                          className="tooltip"
                          style={{ display: "none" }}
                        ></div>
                      </div>
                      <div className="ws-view-note">
                        Drag to brush contigs; the graph and flow view follow.
                      </div>
                    </div>

                    <div className="ws-view ws-flow">
                      <div className="ws-view-header">
                        <span className="ws-view-title">Contig flow between results</span>
                        <div className="ws-view-controls">
                          <Checkbox
                            id="sankey-only-changed"
                            className="cb"
                            size="medium"
                            label="Only changed"
                          />
                          <Checkbox
                            id="sankey-hide-unbinned"
                            className="cb"
                            size="medium"
                            label="Hide unbinned"
                          />
                        </div>
                      </div>

                      <div className="flow-stats">
                        <div className="flow-stat">
                          <div className="flow-stat-label">Changed bin</div>
                          <div id="flow-stat-changed" className="flow-stat-value">—</div>
                        </div>
                        <div className="flow-stat">
                          <div className="flow-stat-label">Re-assigned</div>
                          <div id="flow-stat-reassigned" className="flow-stat-value">—</div>
                        </div>
                        <div className="flow-stat">
                          <div className="flow-stat-label">Newly binned</div>
                          <div
                            id="flow-stat-unbinned-to-binned"
                            className="flow-stat-value"
                          >
                            —
                          </div>
                        </div>
                        <div className="flow-stat">
                          <div className="flow-stat-label">Unbinned</div>
                          <div
                            id="flow-stat-binned-to-unbinned"
                            className="flow-stat-value"
                          >
                            —
                          </div>
                        </div>
                      </div>

                      <div className="sankey-wrap">
                        <div className="sankey-title-row" id="sankey-title-row"></div>
                        <svg
                          id="sankey-svg"
                          role="img"
                          aria-label="Flow diagram showing contig bin changes between results"
                        ></svg>
                        <ViewShimmer />
                        <div
                          id="sankey-tooltip"
                          className="tooltip"
                          style={{ display: "none" }}
                        ></div>
                      </div>
                      <div className="ws-view-note">
                        Click a flow to select those contigs in every view.
                      </div>
                    </div>
                  </div>
                </div>

                {/* ---------- inspector + curation ---------- */}
                <aside className="ws-rail ws-rail-right">
                  <div className="inspector">
                    <div className="inspector-head">
                      <span id="inspector-title" className="settings-title">
                        Refinement summary
                      </span>
                      <Button
                        id="inspector-back"
                        type="button"
                        size="small"
                        appearance="transparent"
                        hidden
                      >
                        Back to summary
                      </Button>
                    </div>
                    <div className="prov-shell">
                      <div id="prov-panel" className="prov-panel">
                        <div className="prov-empty">
                          Run a dataset to see how refinement decided each contig&rsquo;s bin.
                        </div>
                      </div>
                      <InspectorShimmer />
                    </div>
                  </div>

                  <div className="curate-block">
                    <div className="settings-title">Curate</div>
                    <div id="curation-panel" className="curation-panel">
                      <div className="form-row">
                        <Label htmlFor="override-bin" size="small">
                          Assign selected to
                        </Label>
                        <div className="control">
                          <Select id="override-bin" size="small"></Select>
                        </div>
                      </div>
                      <div className="ws-button-row">
                        <Button id="apply-override" type="button" size="small">
                          Lock assignment
                        </Button>
                        <Button id="clear-overrides" type="button" size="small">
                          Clear locks
                        </Button>
                      </div>
                      <div id="override-summary" className="override-summary">
                        No locked assignments.
                      </div>
                      <div className="ws-button-row">
                        <Button
                          id="rerun-refinement"
                          type="button"
                          size="small"
                          appearance="primary"
                        >
                          Re-run refinement
                        </Button>
                        <Button
                          id="export-curated"
                          type="button"
                          size="small"
                          appearance="outline"
                        >
                          Export binning
                        </Button>
                      </div>
                      <div className="ws-view-note">
                        Locked contigs are treated as fixed seeds, so refinement is
                        re-run under your correction rather than around it.
                      </div>
                    </div>
                  </div>
                </aside>
              </div>
            </div>

            <div
              id="panel-output"
              className={`tab-panel ${activeTab === "output" ? "active" : ""}`}
              role="tabpanel"
              aria-labelledby="tab-output"
            >
              <div className="tab-section">
                <div className="section-header">
                  <h2>Output</h2>
                  <div className="section-actions">
                    <span className="collapse-hint" aria-hidden="true">
                      Collapsed
                    </span>
                    <Button
                      className="collapse-toggle"
                      type="button"
                      size="small"
                      appearance="transparent"
                      data-target="section-output"
                      aria-controls="section-output"
                      aria-expanded="true"
                    >
                      Collapse
                    </Button>
                  </div>
                </div>
                <div id="section-output" className="section-body">
                  <div id="output" className="output-box">(logs will appear here)</div>
                  <div className="status-card">
                    <div className="status-title">GraphBin status</div>
                    <div id="graphbin-status" className="status-log output-box">
                      (GraphBin logs will appear here)
                    </div>
                  </div>
                </div>
                <Button id="download-graphbin" type="button" appearance="primary">
                  Download GraphBin output (ZIP)
                </Button>
              </div>

              <div className="tab-section">
                <div className="section-header">
                  <h2>Static plots</h2>
                </div>
                <div className="ws-view-note plots-note">
                  Publication-ready renderings of the same layout used in the
                  workspace, for export.
                </div>
                <div id="section-plots" className="section-body">
                  <PlotsShimmer />
                  <div id="plots-row">
                    <div
                      className="plot-block"
                      id="initial-block"
                      style={{ display: "none" }}
                    >
                      <img id="initial-img" alt="Initial binning plot" />
                      <iframe
                        id="initial-pdf"
                        title="Initial binning plot (PDF)"
                        className="plot-pdf"
                        style={{ display: "none" }}
                      />
                      <Button id="download-initial" type="button" size="small">
                        Download initial binning result plot
                      </Button>
                    </div>

                    <div
                      className="plot-block"
                      id="final-block"
                      style={{ display: "none" }}
                    >
                      <img id="final-img" alt="GraphBin binning plot" />
                      <iframe
                        id="final-pdf"
                        title="GraphBin binning plot (PDF)"
                        className="plot-pdf"
                        style={{ display: "none" }}
                      />
                      <Button id="download-final" type="button" size="small">
                        Download GraphBin binning result plot
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <footer className="app-footer">
          Made by{" "}
          <a
            href="https://vijinimallawaarachchi.com/"
            target="_blank"
            rel="noreferrer"
          >
            Vijini M
          </a>{" "}
          @{" "}
          <a
            href="https://github.com/metagentools"
            target="_blank"
            rel="noreferrer"
          >
            metagentools
          </a>
        </footer>
      </div>
    </FluentProvider>
  );
}
