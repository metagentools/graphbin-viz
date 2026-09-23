import React from "react";
import { Label } from "@fluentui/react-label";

import { HelpTip } from "./HelpTip.jsx";

export function FieldLabel({ htmlFor, children, help, helpLabel }) {
  return (
    <div className="label-with-help">
      <Label htmlFor={htmlFor} size="small">
        {children}
      </Label>
      {help ? <HelpTip label={helpLabel}>{help}</HelpTip> : null}
    </div>
  );
}
