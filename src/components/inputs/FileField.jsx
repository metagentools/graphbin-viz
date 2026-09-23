import React, { useRef } from "react";

import { FieldLabel } from "../common/FieldLabel.jsx";

/**
 * One file input with its label and help.
 *
 * Validation is asynchronous for the contigs file (it has to be read to be
 * counted), so the field owns its own element in order to clear it when the
 * check comes back unhappy.
 */
export function FileField({
  id,
  label,
  help,
  accept,
  multiple = false,
  disabled = false,
  rowId,
  onPick,
}) {
  const inputRef = useRef(null);

  const handleChange = async (event) => {
    const picked = multiple ? [...event.target.files] : event.target.files[0] || null;
    const rejection = await onPick(picked);
    if (rejection) {
      window.alert(rejection);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="form-row" id={rowId}>
      <FieldLabel htmlFor={id} helpLabel={`${label} help`} help={help}>
        {label}
      </FieldLabel>
      <div className="control">
        <input
          id={id}
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple || undefined}
          disabled={disabled || undefined}
          onChange={handleChange}
        />
      </div>
    </div>
  );
}
