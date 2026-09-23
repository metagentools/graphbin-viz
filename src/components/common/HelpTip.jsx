import React from "react";
import { Button } from "@fluentui/react-button";
import { Tooltip } from "@fluentui/react-tooltip";
import { QuestionCircleRegular } from "@fluentui/react-icons";

/** The "?" next to a field label, explaining what the field wants. */
export function HelpTip({ label, children }) {
  return (
    <Tooltip content={children} relationship="description" withArrow>
      <Button
        className="help-btn"
        appearance="transparent"
        size="small"
        type="button"
        icon={<QuestionCircleRegular />}
        aria-label={label}
      />
    </Tooltip>
  );
}
