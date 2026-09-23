import React from "react";
import { Button } from "@fluentui/react-button";

import { useCollapsedSections } from "../../hooks/useCollapsedSections.js";

/**
 * A titled block of the output tab that can be folded away.
 *
 * `collapsible` is optional: "Static plots" has a heading and a body but no
 * toggle, and reusing the same shell keeps the two sections identical apart
 * from that.
 */
export function CollapsibleSection({
  id,
  title,
  collapsible = false,
  isCollapsed,
  onToggle,
  headerNote,
  children,
  footer,
}) {
  const collapsed = collapsible && isCollapsed;
  return (
    <div className={`tab-section${collapsed ? " collapsed" : ""}`}>
      <div className="section-header">
        <h2>{title}</h2>
        {collapsible ? (
          <div className="section-actions">
            <span className="collapse-hint" aria-hidden="true">
              Collapsed
            </span>
            <Button
              className="collapse-toggle"
              type="button"
              size="small"
              appearance="transparent"
              data-target={id}
              aria-controls={id}
              aria-expanded={!collapsed}
              onClick={onToggle}
            >
              {collapsed ? "Expand" : "Collapse"}
            </Button>
          </div>
        ) : null}
      </div>
      {headerNote}
      <div id={id} className="section-body">
        {children}
      </div>
      {footer}
    </div>
  );
}

export { useCollapsedSections };
