import React from "react";
import { Button } from "@fluentui/react-button";
import { Tooltip } from "@fluentui/react-tooltip";
import { ArrowMaximizeRegular, ArrowMinimizeRegular } from "@fluentui/react-icons";

/**
 * Either lower view can take over the screen. The button reads as the corner
 * affordance of the card it belongs to, so it sits last in that card's header
 * controls.
 */
export function MaximizeButton({ maximized, onToggle, label }) {
  const title = maximized ? "Exit full screen" : `Maximise ${label}`;
  return (
    <Tooltip content={title} relationship="label" withArrow>
      <Button
        className="ws-view-maximize"
        appearance="subtle"
        size="small"
        type="button"
        icon={maximized ? <ArrowMinimizeRegular /> : <ArrowMaximizeRegular />}
        aria-label={title}
        aria-pressed={maximized}
        onClick={onToggle}
      />
    </Tooltip>
  );
}
