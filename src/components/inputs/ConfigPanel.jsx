import React, { useEffect, useRef } from "react";

import { CollapsibleSection } from "../common/CollapsibleSection.jsx";
import { useCollapsedSections } from "../../hooks/useCollapsedSections.js";
import { useExecution } from "../../state/executionStore.jsx";
import { useRun } from "../../state/runStore.jsx";
import { InputFilesForm } from "./InputFilesForm.jsx";
import { GraphBinSettingsForm, PlotSettingsForm } from "./SettingsForms.jsx";
import { RunButtons } from "./RunButtons.jsx";

const SECTION_ID = "section-config";

export function ConfigPanel({ onRun, onOpenSessions }) {
  const { isCollapsed, toggleSection, setSectionCollapsed } = useCollapsedSections();
  const { plots } = useRun();
  const { isRestored } = useExecution();
  const hasResult = Boolean(plots.initial || plots.final) || isRestored;

  // Fold the inputs away the moment a result is on screen -- a fresh run or a
  // restored session -- so the workspace/log below isn't buried under a wall
  // of fields once there's something to look at. The reader can still expand
  // it back; this only fires on the transition into having a result, not on
  // every render while one is showing.
  const hadResult = useRef(hasResult);
  useEffect(() => {
    if (hasResult && !hadResult.current) {
      setSectionCollapsed(SECTION_ID, true);
    }
    hadResult.current = hasResult;
  }, [hasResult, setSectionCollapsed]);

  return (
    <section className="panel">
      <CollapsibleSection
        id={SECTION_ID}
        title="Configuration"
        collapsible
        isCollapsed={isCollapsed(SECTION_ID)}
        onToggle={() => toggleSection(SECTION_ID)}
      >
        <div id="config-two-col">
          <InputFilesForm />
          <PlotSettingsForm />
          <GraphBinSettingsForm />
        </div>
      </CollapsibleSection>
      <RunButtons onRun={onRun} onOpenSessions={onOpenSessions} />
    </section>
  );
}
