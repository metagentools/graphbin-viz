import React, { useCallback, useEffect, useRef } from "react";
import { Button } from "@fluentui/react-button";

import { resultName } from "../../lib/model.js";
import { useWorkspaceDerived } from "../../hooks/useWorkspaceDerived.js";
import { useView } from "../../state/viewStore.jsx";
import { ContigFlow } from "./ContigFlow.jsx";
import { CurationPanel } from "./CurationPanel.jsx";
import { FeatureScatter } from "./FeatureScatter.jsx";
import { GraphView } from "./GraphView.jsx";
import { Inspector } from "./Inspector.jsx";
import { WorkspaceToolbar } from "./WorkspaceToolbar.jsx";

/**
 * The coordinated workspace: the assembly graph, a brushable feature scatter
 * and the flow diagram, all reading the same selection, with the inspector
 * and curation on the right.
 *
 * The selection is published on the root element rather than written out in
 * the toolbar, which used to wrap and shove the graph down. The views
 * themselves show it; the data attributes keep it addressable — by CSS, and by
 * the tests — at no cost to the layout.
 */
export function Workspace() {
  const derived = useWorkspaceDerived();
  const { model, results } = derived;
  const { state, dispatch } = useView();
  const graphRef = useRef(null);

  /** Open one contig's record and bring it into view. */
  const openContig = useCallback(
    (id) => {
      dispatch({ type: "inspector/lockNode", id });
      graphRef.current?.focusNode(id);
    },
    [dispatch]
  );

  // Escape leaves full screen, and the page behind it should not scroll away
  // under the overlay.
  useEffect(() => {
    if (!state.maximizedView) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") dispatch({ type: "chrome/maximize", value: null });
    };
    window.addEventListener("keydown", onKey);
    document.body.classList.add("has-maximized-view");
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.classList.remove("has-maximized-view");
    };
  }, [state.maximizedView, dispatch]);

  const selected = state.selection.size;
  const title = model ? `Assembly graph — ${resultName(model, state.mode)}` : "Assembly graph";

  return (
    <div
      className={`workspace${state.bottomHidden ? " bottom-hidden" : ""}`}
      id="workspace"
      data-selected={selected ? String(selected) : undefined}
      data-selection-label={selected ? state.selectionLabel : undefined}
    >
      <div className="ws-main">
        <div className="ws-main-head">
          <span id="graph-view-title" className="settings-title">
            {title}
          </span>
          {/* view-level actions sit with the view's own title rather than in
              the encoding toolbar, which they are not part of */}
          <div className="ws-head-actions">
            <Button
              id="reset-view"
              type="button"
              size="small"
              onClick={() => graphRef.current?.fitToView(true)}
            >
              Reset view
            </Button>
            <Button
              id="clear-selection"
              type="button"
              size="small"
              onClick={() => dispatch({ type: "selection/clear" })}
            >
              Clear selection
            </Button>
            <Button
              id="toggle-bottom-row"
              type="button"
              size="small"
              appearance="transparent"
              onClick={() => dispatch({ type: "chrome/toggleBottom" })}
            >
              {state.bottomHidden ? "Show lower views" : "Hide lower views"}
            </Button>
          </div>
        </div>

        <WorkspaceToolbar results={results} />

        <GraphView ref={graphRef} derived={derived} />
      </div>

      <aside className="ws-rail ws-rail-right">
        <Inspector derived={derived} onOpenContig={openContig} />
        <CurationPanel derived={derived} />
      </aside>

      {/* The lower views sit on their own row under both columns: they read
          the same selection as the graph, and at full width the scatter and
          the flow diagram each get the room their density needs. */}
      <div
        className={`ws-bottom${state.maximizedView ? " has-maximized" : ""}`}
        id="ws-bottom"
      >
        <FeatureScatter derived={derived} />
        <ContigFlow derived={derived} />
      </div>
    </div>
  );
}
