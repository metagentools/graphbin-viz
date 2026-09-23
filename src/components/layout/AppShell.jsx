import React, { useCallback, useEffect, useRef, useState } from "react";
import { FluentProvider } from "@fluentui/react-provider";
import { webDarkTheme, webLightTheme } from "@fluentui/react-theme";
import { Tab, TabList } from "@fluentui/react-tabs";

import { useGraphBinRun } from "../../hooks/useGraphBinRun.js";
import { useTheme } from "../../hooks/useTheme.js";
import { initBenchmarkGlobals } from "../../lib/benchmark.js";
import { useExecution } from "../../state/executionStore.jsx";
import { ConfigPanel } from "../inputs/ConfigPanel.jsx";
import { OutputTab } from "../output/OutputTab.jsx";
import { Workspace } from "../workspace/Workspace.jsx";
import { AppFooter } from "./AppFooter.jsx";
import { AppHeader } from "./AppHeader.jsx";
import { SessionsDialog } from "./SessionsDialog.jsx";
import { ThemeToggle } from "./ThemeToggle.jsx";

/**
 * The page: inputs on top, then the two tabs — the run log and exports, and
 * the coordinated workspace.
 */
export function AppShell() {
  const [activeTab, setActiveTab] = useState("output");
  const { theme, toggleTheme } = useTheme();
  const { start } = useGraphBinRun();
  const workspacePanelRef = useRef(null);
  const baseUrl = import.meta.env.BASE_URL || "/";
  const { isRestored } = useExecution();
  const [sessionsDialogOpen, setSessionsDialogOpen] = useState(false);

  useEffect(() => {
    initBenchmarkGlobals();
  }, []);

  // Opening a saved session -- from the dialog, or from "?execution=" on
  // load -- is worth switching to the workspace for; a fresh run merely
  // finishing is not, so this only fires on the restore transition.
  useEffect(() => {
    if (isRestored) setActiveTab("interactive");
  }, [isRestored]);

  // The flow diagram is sized against the whole workspace panel by CSS, so
  // publish that height for it to read.
  useEffect(() => {
    const panel = workspacePanelRef.current;
    if (!panel || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(() => {
      const h = panel.getBoundingClientRect().height;
      if (h > 0) {
        document.documentElement.style.setProperty(
          "--flow-panel-height",
          `${Math.round(h)}px`
        );
      }
    });
    observer.observe(panel);
    return () => observer.disconnect();
  }, []);

  /** A run always shows its log, whichever tab the reader was on. */
  const handleRun = useCallback(
    (source) => {
      setActiveTab("output");
      start(source);
    },
    [start]
  );

  return (
    <FluentProvider
      className="app-provider"
      theme={theme === "dark" ? webDarkTheme : webLightTheme}
    >
      <div className="app">
        <ThemeToggle theme={theme} onToggle={toggleTheme} />
        <AppHeader baseUrl={baseUrl} />

        <ConfigPanel onRun={handleRun} onOpenSessions={() => setSessionsDialogOpen(true)} />

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
              <Tab id="tab-interactive" value="interactive" aria-controls="panel-interactive">
                Workspace
              </Tab>
            </TabList>
          </div>

          <div className="tab-panels">
            {/* Both panels stay in the document: the canvas and the SVGs can
                only be measured while they are laid out, and the e2e suite
                addresses them by id. */}
            <div
              id="panel-interactive"
              ref={workspacePanelRef}
              className={`tab-panel ${activeTab === "interactive" ? "active" : ""}`}
              role="tabpanel"
              aria-labelledby="tab-interactive"
            >
              <Workspace />
            </div>

            <div
              id="panel-output"
              className={`tab-panel ${activeTab === "output" ? "active" : ""}`}
              role="tabpanel"
              aria-labelledby="tab-output"
            >
              <OutputTab />
            </div>
          </div>
        </section>

        <SessionsDialog open={sessionsDialogOpen} onOpenChange={setSessionsDialogOpen} />

        <AppFooter />
      </div>
    </FluentProvider>
  );
}
