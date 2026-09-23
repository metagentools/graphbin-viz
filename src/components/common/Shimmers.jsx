/**
 * Skeletons shown while a run is in flight.
 *
 * They sit on top rather than replacing the views, because the canvas and the
 * SVGs must stay in the document for the drawing code to size them. Nothing
 * here takes the pointer.
 */

import React from "react";
import { SkeletonItem } from "@fluentui/react-skeleton";

import { useRun } from "../../state/runStore.jsx";

/**
 * One block that fills the frame, the way the static plots shimmer: a handful
 * of thin bars adrift in a tall empty panel reads as a broken render rather
 * than a pending one.
 */
export function ViewShimmer({ className = "" }) {
  const { running } = useRun();
  if (!running) return null;
  return (
    <div className={`shimmer-overlay ${className}`.trim()} aria-hidden="true">
      <SkeletonItem shape="rectangle" />
    </div>
  );
}

export function InspectorShimmer() {
  const { running } = useRun();
  if (!running) return null;
  return (
    <div className="shimmer-inspector" aria-hidden="true">
      <SkeletonItem shape="rectangle" size={40} />
      {Array.from({ length: 6 }, (_, i) => (
        <SkeletonItem key={i} shape="rectangle" size={16} />
      ))}
    </div>
  );
}

export function PlotsShimmer() {
  const { running } = useRun();
  if (!running) return null;
  return (
    <div className="shimmer-plots" aria-hidden="true">
      <SkeletonItem shape="rectangle" />
      <SkeletonItem shape="rectangle" />
    </div>
  );
}
