import React from "react";
import { Button } from "@fluentui/react-button";
import { Spinner } from "@fluentui/react-spinner";

import { useRun } from "../../state/runStore.jsx";

export function RunButtons({ onRun }) {
  const { running } = useRun();
  const spinner = running ? <Spinner size="tiny" /> : undefined;

  return (
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
    </div>
  );
}
