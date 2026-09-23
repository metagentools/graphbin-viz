import React from "react";
import { Button } from "@fluentui/react-button";
import { Spinner } from "@fluentui/react-spinner";
import { FolderOpenRegular } from "@fluentui/react-icons";

import { useExecution } from "../../state/executionStore.jsx";
import { useRun } from "../../state/runStore.jsx";

export function RunButtons({ onRun, onOpenSessions }) {
  const { running } = useRun();
  const { isRestored, executionName } = useExecution();
  const spinner = running ? <Spinner size="tiny" /> : undefined;

  return (
    <>
      <div className="button-row">
        <Button
          id="run-btn"
          type="button"
          appearance="primary"
          disabled={running}
          icon={spinner}
          onClick={() => onRun("upload")}
        >
          Plot binning results
        </Button>
        <Button
          id="example-btn"
          type="button"
          disabled={running}
          icon={spinner}
          onClick={() => onRun("example")}
        >
          Run example data
        </Button>
        <Button
          id="open-sessions-btn"
          type="button"
          appearance="secondary"
          icon={<FolderOpenRegular />}
          onClick={onOpenSessions}
        >
          Open saved session
        </Button>
      </div>
      {isRestored ? (
        <div className="sessions-restored-note">
          Viewing saved session “{executionName}”. Locking contigs and re-running
          refinement needs a fresh run — the original files aren’t kept.
        </div>
      ) : null}
    </>
  );
}
