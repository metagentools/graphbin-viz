import React from "react";
import { Select } from "@fluentui/react-select";

import { FieldLabel } from "../common/FieldLabel.jsx";
import { FileField } from "./FileField.jsx";
import {
  validateContigsFile,
  validateGraphFile,
  validateInitialFile,
} from "../../lib/fileValidation.js";
import { useSettings } from "../../state/settingsStore.jsx";

export function InputFilesForm() {
  const { settings, setSetting, setFile } = useSettings();
  const isSpades = settings.assembler === "spades";

  /** Accept a pick only if it passes its check; return the message otherwise. */
  const pick = (key, validate) => async (file) => {
    const rejection = validate ? await validate(file) : null;
    setFile(key, rejection ? null : file);
    return rejection;
  };

  return (
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
            <Select
              id="assembler"
              value={settings.assembler}
              onChange={(e) => setSetting("assembler", e.target.value)}
            >
              <option value="spades">SPAdes</option>
              <option value="megahit">MEGAHIT</option>
            </Select>
          </div>
        </div>

        <FileField
          id="graph"
          label="GFA file"
          accept=".gfa"
          help="The GFA file output from the assembler (< 200 MB)"
          onPick={pick("graph", validateGraphFile)}
        />

        <FileField
          id="contigs"
          label="Contigs file"
          accept=".fasta,.fa,.fna"
          help="The contigs file (e.g., contigs.fasta from SPAdes) (< 200 MB and < 10,000 contigs)"
          onPick={pick("contigs", validateContigsFile)}
        />

        <FileField
          id="paths"
          rowId="paths-row"
          label="Paths file"
          disabled={!isSpades}
          help="The paths file of the contigs (e.g., contigs.paths from SPAdes). Not required for MEGAHIT."
          onPick={pick("paths")}
        />

        <FileField
          id="initial"
          label="Initial binning result"
          accept=".csv,.tsv"
          help="The binning result from any existing metagenomic binning tool in CSV or TSV format (contig name, bin ID). GraphBin will refine this result."
          onPick={pick("initial", validateInitialFile)}
        />

        <FileField
          id="extra-results"
          label="Other binning results"
          accept=".csv,.tsv"
          multiple
          help="Optional. Additional binning results (CSV/TSV, one file per tool) over the same assembly. Each becomes another column in the comparison, so you can see where several binners agree, disagree, or are contradicted by the assembly graph."
          onPick={pick("extras")}
        />

        <div className="form-row">
          <FieldLabel
            htmlFor="setting-delimiter"
            helpLabel="Delimiter help"
            help="Delimiter used in the binning results"
          >
            Delimiter
          </FieldLabel>
          <div className="control">
            <Select
              id="setting-delimiter"
              value={settings.delimiter}
              onChange={(e) => setSetting("delimiter", e.target.value)}
            >
              <option value=",">Comma (,)</option>
              <option value="\t">Tab (\t)</option>
            </Select>
          </div>
        </div>
      </div>
    </div>
  );
}
