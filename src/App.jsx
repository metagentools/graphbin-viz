import React, { useEffect, useState } from "react";
import { initApp } from "./app.js";

export default function App() {
  const [activeTab, setActiveTab] = useState("output");
  const baseUrl = import.meta.env.BASE_URL || "/";

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

    const handleDocClick = (event) => {
      const target = event.target;
      if (target && target.closest && target.closest("details.help")) {
        return;
      }
      document.querySelectorAll("details.help[open]").forEach((detail) => {
        detail.open = false;
      });
    };

    const handleSystemChange = () => {
      if (!localStorage.getItem(storageKey)) {
        applyTheme(getSystemTheme());
      }
    };

    if (toggleButton) {
      toggleButton.addEventListener("click", handleToggle);
    }

    document.addEventListener("click", handleDocClick);

    if (media.addEventListener) {
      media.addEventListener("change", handleSystemChange);
    } else {
      media.addListener(handleSystemChange);
    }

    return () => {
      if (toggleButton) {
        toggleButton.removeEventListener("click", handleToggle);
      }
      document.removeEventListener("click", handleDocClick);
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
    <div className="app">
      <button
        id="theme-toggle"
        className="theme-toggle"
        type="button"
        aria-label="Switch to dark mode"
        aria-pressed="false"
      >
        <svg className="icon sun" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 4.5a1 1 0 0 1 1 1V7a1 1 0 1 1-2 0V5.5a1 1 0 0 1 1-1Zm0 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm7.5-3.5a1 1 0 0 1 1 1v.1a1 1 0 0 1-1 1h-1.4a1 1 0 1 1 0-2h1.4ZM5.9 12a1 1 0 0 1-1 1H3.5a1 1 0 1 1 0-2h1.4a1 1 0 0 1 1 1Zm10.25-5.6a1 1 0 0 1 1.4 0l1 1a1 1 0 0 1-1.4 1.4l-1-1a1 1 0 0 1 0-1.4ZM6.45 16.3a1 1 0 0 1 1.4 0l1 1a1 1 0 0 1-1.4 1.4l-1-1a1 1 0 0 1 0-1.4ZM18.55 16.3a1 1 0 0 1 0 1.4l-1 1a1 1 0 1 1-1.4-1.4l1-1a1 1 0 0 1 1.4 0ZM7.85 5.1a1 1 0 0 1 0 1.4l-1 1A1 1 0 1 1 5.45 6.1l1-1a1 1 0 0 1 1.4 0Z" />
        </svg>
        <svg className="icon moon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M20.2 15.3a8.2 8.2 0 0 1-11.5-11 1 1 0 0 0-1.5-1.1 10 10 0 1 0 14.1 13.9 1 1 0 0 0-1.1-1.8Z" />
        </svg>
      </button>
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
                <span className="intro-chip" role="listitem">Assembly graph visualization</span>
                <span className="intro-chip" role="listitem">Interactive comparisons</span>
                <span className="intro-chip" role="listitem">Local execution</span>
                <span className="intro-chip" role="listitem">No data leaves your machine</span>
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
                <div className="label-with-help">
                  <label htmlFor="assembler">Assembler</label>
                  <details className="help" role="group">
                    <summary aria-label="Assembler help">?</summary>
                    <span className="help-tooltip" role="tooltip">
                      The assembler used to assemble your metagenomic sample
                    </span>
                  </details>
                </div>
                <div className="control">
                  <select id="assembler" defaultValue="spades">
                    <option value="spades">SPAdes</option>
                    <option value="megahit">MEGAHIT</option>
                  </select>
                </div>
              </div>

              <div className="form-row">
                <div className="label-with-help">
                  <label htmlFor="graph">GFA file</label>
                  <details className="help" role="group">
                    <summary aria-label="GFA file help">?</summary>
                    <span className="help-tooltip" role="tooltip">
                      The GFA file output from the assembler (&lt; 200 MB)
                    </span>
                  </details>
                </div>
                <div className="control">
                  <input id="graph" type="file" accept=".gfa" />
                </div>
              </div>

              <div className="form-row">
                <div className="label-with-help">
                  <label htmlFor="contigs">Contigs file</label>
                  <details className="help" role="group">
                    <summary aria-label="Contigs file help">?</summary>
                    <span className="help-tooltip" role="tooltip">
                      The contigs file (e.g., contigs.fasta from SPAdes) (&lt; 200 MB and &lt; 10,000 contigs)
                    </span>
                  </details>
                </div>
                <div className="control">
                  <input id="contigs" type="file" accept=".fasta,.fa,.fna" />
                </div>
              </div>

              <div className="form-row" id="paths-row">
                <div className="label-with-help">
                  <label htmlFor="paths">Paths file</label>
                  <details className="help" role="group">
                    <summary aria-label="Paths file help">?</summary>
                    <span className="help-tooltip" role="tooltip">
                      The paths file of the contigs (e.g., contigs.paths from
                      SPAdes). Not required for MEGAHIT.
                    </span>
                  </details>
                </div>
                <div className="control">
                  <input id="paths" type="file" />
                </div>
              </div>

              <div className="form-row">
                <div className="label-with-help">
                  <label htmlFor="initial">Initial binning result</label>
                  <details className="help" role="group">
                    <summary aria-label="Initial binning result help">?</summary>
                    <span className="help-tooltip" role="tooltip">
                      The binning result from any existing metagenomic binning
                      tool in CSV or TSV format (contig name, bin ID). GraphBin
                      will refine this result.
                    </span>
                  </details>
                </div>
                <div className="control">
                  <input id="initial" type="file" accept=".csv,.tsv" />
                </div>
              </div>

              <div className="form-row">
                <div className="label-with-help">
                  <label htmlFor="extra-results">Other binning results</label>
                  <details className="help" role="group">
                    <summary aria-label="Other binning results help">?</summary>
                    <span className="help-tooltip" role="tooltip">
                      Optional. Additional binning results (CSV/TSV, one file per
                      tool) over the same assembly. Each becomes another column in
                      the comparison, so you can see where several binners agree,
                      disagree, or are contradicted by the assembly graph.
                    </span>
                  </details>
                </div>
                <div className="control">
                  <input id="extra-results" type="file" accept=".csv,.tsv" multiple />
                </div>
              </div>

              <div className="form-row">
                <div className="label-with-help">
                  <label htmlFor="setting-delimiter">Delimiter</label>
                  <details className="help" role="group">
                    <summary aria-label="Delimiter help">?</summary>
                    <span className="help-tooltip" role="tooltip">
                      Delimiter used in the binning results
                    </span>
                  </details>
                </div>
                <div className="control">
                  <select id="setting-delimiter" defaultValue=",">
                    <option value=",">Comma (,)</option>
                    <option value="\t">Tab (\t)</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div id="settings-panel">
            <div className="settings-title">Plot Settings</div>

            <div className="form-grid">
              <div className="form-row">
                <label htmlFor="setting-dpi">DPI</label>
                <div className="control">
                  <input type="number" id="setting-dpi" defaultValue="300" />
                </div>
              </div>

              <div className="form-row">
                <label htmlFor="setting-width">Width (px)</label>
                <div className="control">
                  <input type="number" id="setting-width" defaultValue="2000" />
                </div>
              </div>

              <div className="form-row">
                <label htmlFor="setting-height">Height (px)</label>
                <div className="control">
                  <input type="number" id="setting-height" defaultValue="2000" />
                </div>
              </div>

              <div className="form-row">
                <label htmlFor="setting-vsize">Vertex Size</label>
                <div className="control">
                  <input type="number" id="setting-vsize" defaultValue="50" />
                </div>
              </div>

              <div className="form-row">
                <label htmlFor="setting-lsize">Label Size</label>
                <div className="control">
                  <input type="number" id="setting-lsize" defaultValue="2" />
                </div>
              </div>

              <div className="form-row">
                <label htmlFor="setting-imgtype">Image Type</label>
                <div className="control">
                  <select id="setting-imgtype" defaultValue="png">
                    <option value="png">PNG</option>
                    <option value="svg">SVG</option>
                    <option value="pdf">PDF</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div className="settings-group settings-group-wide">
            <div className="settings-title">GraphBin Settings</div>
            <div className="form-grid two-col">
              <div className="form-grid">
                <div className="form-row">
                  <div className="label-with-help">
                    <label htmlFor="setting-max-iter">Max Iterations</label>
                    <details className="help" role="group">
                      <summary aria-label="Max Iterations help">?</summary>
                      <span className="help-tooltip" role="tooltip">
                        Maximum number of iterations for the label propagation
                      </span>
                    </details>
                  </div>
                  <div className="control">
                    <input
                      type="number"
                      id="setting-max-iter"
                      defaultValue="50"
                      min="1"
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="label-with-help">
                    <label htmlFor="setting-min-bin-size">Minimum bin size</label>
                    <details className="help" role="group">
                      <summary aria-label="Minimum bin size help">?</summary>
                      <span className="help-tooltip" role="tooltip">
                        Minimum bin size to prevent bins from being removed during label correction
                      </span>
                    </details>
                  </div>
                  <div className="control">
                    <input
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
                  <div className="label-with-help">
                    <label htmlFor="setting-diff-threshold">Diff Threshold</label>
                    <details className="help" role="group">
                      <summary aria-label="Diff Threshold help">?</summary>
                      <span className="help-tooltip" role="tooltip">
                        Difference threshold to stop the label propagation
                      </span>
                    </details>
                  </div>
                  <div className="control">
                    <input
                      type="number"
                      id="setting-diff-threshold"
                      defaultValue="0.00001"
                      step="0.000001"
                      min="0"
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="label-with-help">
                    <label htmlFor="setting-show-lp-log">Show LP log</label>
                    <details className="help" role="group">
                      <summary aria-label="Show LP log help">?</summary>
                      <span className="help-tooltip" role="tooltip">
                        Show logs from label propagation
                      </span>
                    </details>
                  </div>
                  <div className="control">
                    <select id="setting-show-lp-log" defaultValue="false">
                      <option value="false">No</option>
                      <option value="true">Yes</option>
                    </select>
                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>

        <div className="button-row">
          <button
            id="run-btn"
            className="btn primary"
            type="button"
            onClick={() => setActiveTab("output")}
          >
            Plot binning results
          </button>
          <button
            id="example-btn"
            className="btn secondary"
            type="button"
            onClick={() => setActiveTab("output")}
          >
            Run example data
          </button>
        </div>
      </section>

      <section className="panel tab-shell">
        <div className="tab-header">
          <div className="tab-buttons" role="tablist" aria-label="Views">
            <button
              id="tab-output"
              className={`tab-btn ${activeTab === "output" ? "active" : ""}`}
              type="button"
              role="tab"
              aria-selected={activeTab === "output"}
              aria-controls="panel-output"
              onClick={() => setActiveTab("output")}
            >
              Run log &amp; exports
            </button>
            <button
              id="tab-interactive"
              className={`tab-btn ${activeTab === "interactive" ? "active" : ""}`}
              type="button"
              role="tab"
              aria-selected={activeTab === "interactive"}
              aria-controls="panel-interactive"
              onClick={() => setActiveTab("interactive")}
            >
              Workspace
            </button>
          </div>
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
                  <button id="toggle-bottom-row" className="ws-linkbtn" type="button">
                    Hide lower views
                  </button>
                </div>

                {/* ---------- toolbar: encoding + filtering ---------- */}
                <div className="ws-toolbar">
                  <div className="tb-row">
                    <div className="tb-field">
                      <label htmlFor="view-mode">Result</label>
                      <select id="view-mode" defaultValue="r0"></select>
                    </div>

                    <div className="tb-field">
                      <label htmlFor="color-mode">Colour by</label>
                      <select id="color-mode" defaultValue="bin">
                        <option value="bin">Bin assignment</option>
                        <option value="confidence">Refinement confidence</option>
                        <option value="disagreement">Cross-result disagreement</option>
                        <option value="stage">Decision stage</option>
                        <option value="cov">Coverage</option>
                        <option value="gc">GC content</option>
                        <option value="len">Contig length</option>
                      </select>
                    </div>

                    <div className="tb-field">
                      <label htmlFor="size-mode">Size by</label>
                      <select id="size-mode" defaultValue="uniform">
                        <option value="uniform">Uniform</option>
                        <option value="len">Contig length</option>
                        <option value="cov">Coverage</option>
                        <option value="degree">Degree</option>
                      </select>
                    </div>

                    <div className="tb-field">
                      <label htmlFor="bin-filter">Show only bin</label>
                      <select id="bin-filter">
                        <option value="">(all bins)</option>
                      </select>
                    </div>

                    <div className="tb-field tb-field-range">
                      <label htmlFor="node-size">Node size</label>
                      <div className="range-row">
                        <input
                          id="node-size"
                          type="range"
                          min="2"
                          max="16"
                          step="0.5"
                          defaultValue="5.5"
                        />
                        <span id="node-size-value" className="range-value">
                          5.5
                        </span>
                      </div>
                    </div>

                    <div className="tb-actions">
                      <button id="reset-view" className="btn secondary tb-btn" type="button">
                        Reset view
                      </button>
                      <button
                        id="clear-selection"
                        className="btn secondary tb-btn"
                        type="button"
                      >
                        Clear selection
                      </button>
                    </div>
                  </div>

                  <div className="tb-row tb-row-chips" role="group" aria-label="Filters">
                    <span className="tb-chip-label">Show</span>
                    <label className="chip">
                      <input id="toggle-only-changed" type="checkbox" />
                      <span>Changed</span>
                    </label>
                    <label className="chip">
                      <input id="toggle-only-disputed" type="checkbox" />
                      <span>Disputed</span>
                    </label>
                    <label className="chip">
                      <input id="toggle-low-confidence" type="checkbox" />
                      <span>Low confidence</span>
                    </label>

                    <span className="tb-chip-sep" aria-hidden="true"></span>

                    <label className="chip">
                      <input id="toggle-hide-unbinned" type="checkbox" />
                      <span>Hide unbinned</span>
                    </label>
                    <label className="chip">
                      <input id="toggle-hide-isolated" type="checkbox" />
                      <span>Hide isolated</span>
                    </label>

                    <span className="tb-chip-sep" aria-hidden="true"></span>
                    <span className="tb-chip-label">Mark</span>

                    <label className="chip">
                      <input id="toggle-mark-changed" type="checkbox" />
                      <span>Changed between results</span>
                    </label>
                    <label className="chip">
                      <input id="toggle-mark-misbinned" type="checkbox" />
                      <span>Likely misbinned</span>
                    </label>
                    <label className="chip">
                      <input id="toggle-mark-ambiguous" type="checkbox" />
                      <span>Ambiguous</span>
                    </label>

                    <span id="selection-summary" className="tb-selection"></span>
                  </div>
                </div>

                {/* ---------- graph ---------- */}
                <div className="ws-graph">
                  <div className="interactive-canvas-wrap">
                    <canvas id="graph-canvas" width="900" height="640"></canvas>
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
                    <button id="replay-play" className="btn tertiary" type="button">
                      Play
                    </button>
                    <input
                      id="replay-slider"
                      type="range"
                      min="0"
                      max="0"
                      step="1"
                      defaultValue="0"
                      disabled
                    />
                    <span id="replay-value" className="range-value">
                      off
                    </span>
                    <label className="replay-speed" htmlFor="replay-speed">
                      <span>Speed</span>
                      <select id="replay-speed" defaultValue="600">
                        <option value="1600">Very slow</option>
                        <option value="1000">Slow</option>
                        <option value="600">Normal</option>
                        <option value="280">Fast</option>
                      </select>
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
                        <select id="scatter-x" defaultValue="gc">
                          <option value="gc">GC %</option>
                          <option value="cov">Coverage</option>
                          <option value="len">Length</option>
                          <option value="confidence">Confidence</option>
                        </select>
                        <select id="scatter-y" defaultValue="cov">
                          <option value="cov">Coverage</option>
                          <option value="gc">GC %</option>
                          <option value="len">Length</option>
                          <option value="confidence">Confidence</option>
                        </select>
                      </div>
                    </div>
                    <div className="scatter-wrap">
                      <svg
                        id="feature-scatter"
                        role="img"
                        aria-label="Contig feature scatter plot, brushable"
                      ></svg>
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
                        <label className="cb">
                          <input id="sankey-only-changed" type="checkbox" />
                          <span className="cb-box" aria-hidden="true"></span>
                          <span className="cb-text">Only changed</span>
                        </label>
                        <label className="cb">
                          <input id="sankey-hide-unbinned" type="checkbox" />
                          <span className="cb-box" aria-hidden="true"></span>
                          <span className="cb-text">Hide unbinned</span>
                        </label>
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
                    <button
                      id="inspector-back"
                      className="ws-linkbtn"
                      type="button"
                      hidden
                    >
                      Back to summary
                    </button>
                  </div>
                  <div id="prov-panel" className="prov-panel">
                    <div className="prov-empty">
                      Run a dataset to see how refinement decided each contig&rsquo;s bin.
                    </div>
                  </div>
                </div>

                <div className="curate-block">
                  <div className="settings-title">Curate</div>
                  <div id="curation-panel" className="curation-panel">
                    <div className="form-row">
                      <label htmlFor="override-bin">Assign selected to</label>
                      <div className="control">
                        <select id="override-bin"></select>
                      </div>
                    </div>
                    <div className="ws-button-row">
                      <button id="apply-override" className="btn secondary" type="button">
                        Lock assignment
                      </button>
                      <button id="clear-overrides" className="btn secondary" type="button">
                        Clear locks
                      </button>
                    </div>
                    <div id="override-summary" className="override-summary">
                      No locked assignments.
                    </div>
                    <div className="ws-button-row">
                      <button id="rerun-refinement" className="btn primary" type="button">
                        Re-run refinement
                      </button>
                      <button id="export-curated" className="btn tertiary" type="button">
                        Export binning
                      </button>
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
                  <button
                    className="collapse-toggle"
                    type="button"
                    data-target="section-output"
                    aria-controls="section-output"
                    aria-expanded="true"
                  >
                    Collapse
                  </button>
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
              <button id="download-graphbin" className="btn primary">
                Download GraphBin output (ZIP)
              </button>
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
                    <button id="download-initial" className="btn tertiary">
                      Download initial binning result plot
                    </button>
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
                    <button id="download-final" className="btn tertiary">
                      Download GraphBin binning result plot
                    </button>
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
  );
}
