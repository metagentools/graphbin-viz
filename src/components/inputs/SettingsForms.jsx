import React from "react";
import { Input } from "@fluentui/react-input";
import { Select } from "@fluentui/react-select";

import { FieldLabel } from "../common/FieldLabel.jsx";
import { useSettings } from "../../state/settingsStore.jsx";

/** One number field bound to the settings store. */
function NumberField({ id, settingKey, label, help, helpLabel, ...inputProps }) {
  const { settings, setSetting } = useSettings();
  return (
    <div className="form-row">
      <FieldLabel htmlFor={id} help={help} helpLabel={helpLabel}>
        {label}
      </FieldLabel>
      <div className="control">
        <Input
          type="number"
          id={id}
          value={settings[settingKey]}
          onChange={(e) => setSetting(settingKey, e.target.value)}
          {...inputProps}
        />
      </div>
    </div>
  );
}

export function PlotSettingsForm() {
  const { settings, setSetting } = useSettings();
  return (
    <div id="settings-panel">
      <div className="settings-title">Plot Settings</div>
      <div className="form-grid">
        <NumberField id="setting-dpi" settingKey="dpi" label="DPI" />
        <NumberField id="setting-width" settingKey="width" label="Width (px)" />
        <NumberField id="setting-height" settingKey="height" label="Height (px)" />
        <NumberField id="setting-vsize" settingKey="vsize" label="Vertex Size" />
        <NumberField id="setting-lsize" settingKey="lsize" label="Label Size" />

        <div className="form-row">
          <FieldLabel htmlFor="setting-imgtype">Image Type</FieldLabel>
          <div className="control">
            <Select
              id="setting-imgtype"
              value={settings.imgtype}
              onChange={(e) => setSetting("imgtype", e.target.value)}
            >
              <option value="png">PNG</option>
              <option value="svg">SVG</option>
              <option value="pdf">PDF</option>
            </Select>
          </div>
        </div>
      </div>
    </div>
  );
}

export function GraphBinSettingsForm() {
  const { settings, setSetting } = useSettings();
  return (
    <div className="settings-group settings-group-wide">
      <div className="settings-title">GraphBin Settings</div>
      <div className="form-grid two-col">
        <div className="form-grid">
          <NumberField
            id="setting-max-iter"
            settingKey="maxIteration"
            label="Max Iterations"
            helpLabel="Max Iterations help"
            help="Maximum number of iterations for the label propagation"
            min="1"
          />
          <NumberField
            id="setting-min-bin-size"
            settingKey="minBinSize"
            label="Minimum bin size"
            helpLabel="Minimum bin size help"
            help="Minimum bin size to prevent bins from being removed during label correction"
            min="1"
          />
        </div>

        <div className="form-grid">
          <NumberField
            id="setting-diff-threshold"
            settingKey="diffThreshold"
            label="Diff Threshold"
            helpLabel="Diff Threshold help"
            help="Difference threshold to stop the label propagation"
            step="0.000001"
            min="0"
          />

          <div className="form-row">
            <FieldLabel
              htmlFor="setting-show-lp-log"
              helpLabel="Show LP log help"
              help="Show logs from label propagation"
            >
              Show LP log
            </FieldLabel>
            <div className="control">
              <Select
                id="setting-show-lp-log"
                value={settings.showLpLog}
                onChange={(e) => setSetting("showLpLog", e.target.value)}
              >
                <option value="false">No</option>
                <option value="true">Yes</option>
              </Select>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
