import React from "react";

import { InputFilesForm } from "./InputFilesForm.jsx";
import { GraphBinSettingsForm, PlotSettingsForm } from "./SettingsForms.jsx";
import { RunButtons } from "./RunButtons.jsx";

export function ConfigPanel({ onRun, onOpenSessions }) {
  return (
    <section className="panel">
      <div id="config-two-col">
        <InputFilesForm />
        <PlotSettingsForm />
        <GraphBinSettingsForm />
      </div>
      <RunButtons onRun={onRun} onOpenSessions={onOpenSessions} />
    </section>
  );
}
