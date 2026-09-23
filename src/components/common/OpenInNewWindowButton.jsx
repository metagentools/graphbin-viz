import React from "react";
import { Button } from "@fluentui/react-button";
import { Tooltip } from "@fluentui/react-tooltip";
import { WindowNewRegular } from "@fluentui/react-icons";

/**
 * Opens this chart, maximized, in a new browser window -- a shareable link
 * onto the saved session (`?execution=<id>&maximize=<view>`), not a live
 * view: the new window loads its own copy of the app and restores from
 * IndexedDB, so it never touches this tab's in-memory state directly. It
 * sits immediately left of the maximize button, the other corner control
 * every lower view carries.
 */
export function OpenInNewWindowButton({ onOpen, label, disabled }) {
  const title = disabled
    ? `Save this run to open ${label} in a new window`
    : `Open ${label} in a new window`;
  return (
    <Tooltip content={title} relationship="label" withArrow>
      <Button
        className="ws-view-open-window"
        appearance="subtle"
        size="small"
        type="button"
        icon={<WindowNewRegular />}
        aria-label={title}
        disabled={disabled}
        onClick={onOpen}
      />
    </Tooltip>
  );
}
