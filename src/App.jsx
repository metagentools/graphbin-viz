import React from "react";

import { AppShell } from "./components/layout/AppShell.jsx";
import { ModelProvider } from "./state/modelStore.jsx";
import { RunProvider } from "./state/runStore.jsx";
import { SettingsProvider } from "./state/settingsStore.jsx";
import { ViewProvider } from "./state/viewStore.jsx";

/**
 * GraphBin-Viz.
 *
 * Four stores, each with one job: the input form, the run in flight, the
 * loaded comparison model, and the workspace view state. Everything below
 * reads them through hooks rather than reaching across the tree.
 */
export default function App() {
  return (
    <SettingsProvider>
      <RunProvider>
        <ModelProvider>
          <ViewProvider>
            <AppShell />
          </ViewProvider>
        </ModelProvider>
      </RunProvider>
    </SettingsProvider>
  );
}
