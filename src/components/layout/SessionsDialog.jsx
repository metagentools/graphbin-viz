import React, { useEffect, useState } from "react";
import { Button } from "@fluentui/react-button";
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
} from "@fluentui/react-dialog";
import { Input } from "@fluentui/react-input";
import { Spinner } from "@fluentui/react-spinner";
import { DeleteRegular } from "@fluentui/react-icons";

import { deleteSession, listSessions, renameSession } from "../../lib/sessionsDb.js";
import { useExecution } from "../../state/executionStore.jsx";

function formatWhen(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}

function summarise(session) {
  const parts = [
    session.isExample ? "Example data" : session.assembler === "megahit" ? "MEGAHIT" : "SPAdes",
  ];
  const nodes = session.model?.nodes?.length;
  if (typeof nodes === "number") parts.push(`${nodes.toLocaleString()} contigs`);
  return parts.join(" \u00b7 ");
}

/**
 * Every saved session, newest first. Opening one restores its result -- the
 * graph, plots, log and encodings -- as a view: re-running refinement needs
 * the original files again, since the Pyodide filesystem a run used does
 * not survive a reload.
 */
export function SessionsDialog({ open, onOpenChange }) {
  const { openSessionById } = useExecution();
  const [sessions, setSessions] = useState(null);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    if (!open) return;
    setSessions(null);
    listSessions()
      .then(setSessions)
      .catch((e) => {
        console.warn("Could not list saved sessions:", e);
        setSessions([]);
      });
  }, [open]);

  const handleOpen = async (id) => {
    setBusyId(id);
    await openSessionById(id);
    setBusyId(null);
    onOpenChange(false);
  };

  const handleDelete = async (id) => {
    setBusyId(id);
    try {
      await deleteSession(id);
      setSessions((prev) => (prev || []).filter((s) => s.id !== id));
    } catch (e) {
      console.warn("Could not delete saved session:", e);
    } finally {
      setBusyId(null);
    }
  };

  const handleRename = (id, name) => {
    setSessions((prev) => (prev || []).map((s) => (s.id === id ? { ...s, name } : s)));
    renameSession(id, name).catch((e) => console.warn("Could not rename saved session:", e));
  };

  return (
    <Dialog open={open} onOpenChange={(_, data) => onOpenChange(data.open)}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>Saved sessions</DialogTitle>
          <DialogContent>
            {sessions === null ? (
              <div className="sessions-empty">
                <Spinner size="tiny" label="Loading saved sessions..." />
              </div>
            ) : sessions.length === 0 ? (
              <div className="sessions-empty">
                No saved sessions yet \u2014 finishing a run saves one automatically.
              </div>
            ) : (
              <ul className="sessions-list">
                {sessions.map((session) => (
                  <li className="sessions-row" key={session.id}>
                    <div className="sessions-row-main">
                      <Input
                        className="sessions-row-name"
                        size="small"
                        appearance="underline"
                        value={session.name}
                        onChange={(_, data) => handleRename(session.id, data.value)}
                        aria-label={`Name for session saved ${formatWhen(session.updatedAt)}`}
                      />
                      <div className="sessions-row-meta">
                        {formatWhen(session.updatedAt)} \u00b7 {summarise(session)}
                      </div>
                    </div>
                    <div className="sessions-row-actions">
                      <Button
                        size="small"
                        appearance="primary"
                        disabled={busyId === session.id}
                        onClick={() => handleOpen(session.id)}
                      >
                        Open
                      </Button>
                      <Button
                        size="small"
                        appearance="subtle"
                        icon={<DeleteRegular />}
                        aria-label="Delete this saved session"
                        disabled={busyId === session.id}
                        onClick={() => handleDelete(session.id)}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
