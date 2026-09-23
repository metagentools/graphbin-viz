/**
 * The Python runtime.
 *
 * Pyodide is loaded once per page and shared: it is the single most expensive
 * thing the app does, and GraphBin, the plotting and the exporter all run
 * inside the same interpreter. Everything here is about getting files in and
 * out of its virtual filesystem.
 */

import { getFileExtension, mimeForExtension } from "../download.js";
import { roundMs } from "../benchmark.js";

const PYODIDE_INDEX_URL = "https://cdn.jsdelivr.net/pyodide/v0.29.0/full/";
const PYODIDE_SCRIPT_URL = PYODIDE_INDEX_URL + "pyodide.js";
const PYODIDE_SCRIPT_TIMEOUT_MS = 30_000;

/**
 * `loadPyodide` used to be defined by a blocking <script> tag in index.html,
 * loaded on every page view whether or not the user ever runs anything. That
 * had two problems: a slow/unreachable CDN request blocked the whole page
 * from bootstrapping (this is what broke CI - the request hangs rather than
 * failing fast on GitHub Actions' network, so the app never mounted and every
 * e2e test timed out waiting for "Interactive graph loaded"), and the e2e
 * tests' Pyodide stub (window.loadPyodide, set via addInitScript before the
 * CDN script could run) was always one race away from being overwritten by
 * the real thing.
 *
 * Loading it lazily, only when a run actually starts, and skipping the
 * network entirely when something (a test stub, or a future offline runtime)
 * has already defined window.loadPyodide, fixes both: normal page loads and
 * tests never touch the CDN unless and until they need it, and a genuinely
 * unreachable CDN now fails fast and visibly instead of hanging.
 */
function ensureLoadPyodide() {
  if (typeof window.loadPyodide === "function") return Promise.resolve();

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = PYODIDE_SCRIPT_URL;

    const timer = setTimeout(() => {
      script.remove();
      reject(
        new Error(
          `Timed out loading the Pyodide runtime from ${PYODIDE_SCRIPT_URL} after ${
            PYODIDE_SCRIPT_TIMEOUT_MS / 1000
          }s. Check your network connection and try again.`
        )
      );
    }, PYODIDE_SCRIPT_TIMEOUT_MS);

    script.onload = () => {
      clearTimeout(timer);
      resolve();
    };
    script.onerror = () => {
      clearTimeout(timer);
      script.remove();
      reject(new Error(`Failed to load the Pyodide runtime from ${PYODIDE_SCRIPT_URL}.`));
    };

    document.head.appendChild(script);
  });
}

const PY_DIRS = ["/py", "/py/graphbin", "/py/graphbin/parsers", "/py/graphbin/labelpropagation", "/data", "/out"];

const PY_FILES = [
  "spades_plot.py",
  "megahit_plot.py",
  "bidictmap.py",
  "export_common.py",
  "interactive_export.py",
  "interactive_export_megahit.py",
  "graphbin/graphbin_SPAdes.py",
  "graphbin/graphbin_MEGAHIT.py",
  "graphbin/graphbin_Func.py",
  "graphbin/labelpropagation/__init__.py",
  "graphbin/labelpropagation/labelprop.py",
  "graphbin/parsers/__init__.py",
  "graphbin/parsers/spades_parser.py",
  "graphbin/parsers/megahit_parser.py",
];

let pyodideReady = null;

export function getPyodide(log = () => {}) {
  if (pyodideReady) return pyodideReady;

  pyodideReady = (async () => {
    log("Loading Pyodide...");
    await ensureLoadPyodide();
    const pyodide = await loadPyodide({ indexURL: PYODIDE_INDEX_URL });

    log("Loading igraph + matplotlib...");
    await pyodide.loadPackage(["igraph", "matplotlib"]);

    for (const dir of PY_DIRS) {
      try {
        pyodide.FS.mkdir(dir);
      } catch (e) {
        /* already there */
      }
    }

    log("Loading Python files into Pyodide FS...");
    for (const f of PY_FILES) {
      const text = await (await fetch("py/" + f)).text();
      pyodide.FS.writeFile("/py/" + f, text);
    }

    await pyodide.runPythonAsync(`
import sys
if "/py" not in sys.path:
    sys.path.append("/py")
if "/py/graphbin" not in sys.path:
    sys.path.append("/py/graphbin")
    `);

    return pyodide;
  })();

  return pyodideReady;
}

/* ------------------------------ filesystem ------------------------------ */

function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsArrayBuffer(file);
  });
}

export async function writeUploadedFile(pyodide, inputFile, destPath) {
  const buf = await readFileAsArrayBuffer(inputFile);
  pyodide.FS.writeFile(destPath, new Uint8Array(buf));
  return destPath;
}

export async function writeServerFile(pyodide, url, destPath) {
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${url}: ${resp.status} ${resp.statusText}`);
  }
  const buf = await resp.arrayBuffer();
  pyodide.FS.writeFile(destPath, new Uint8Array(buf));
  return destPath;
}

export function readJsonFromPyodide(pyodide, path) {
  return JSON.parse(pyodide.FS.readFile(path, { encoding: "utf8" }));
}

export function readTextFromPyodide(pyodide, path) {
  return pyodide.FS.readFile(path, { encoding: "utf8" });
}

export function getPyodideFileSize(pyodide, path) {
  try {
    return pyodide.FS.stat(path).size;
  } catch (e) {
    return null;
  }
}

export function readLayoutTiming(pyodide, path = "/out/layout_timing.json") {
  try {
    const layoutMs = Number(readJsonFromPyodide(pyodide, path)?.layout_ms);
    return Number.isFinite(layoutMs) ? roundMs(layoutMs) : null;
  } catch (e) {
    return null;
  }
}

export function fileToObjectUrl(pyodide, path) {
  const ext = getFileExtension(path);
  const data = pyodide.FS.readFile(path);
  return URL.createObjectURL(new Blob([data], { type: mimeForExtension(ext) }));
}

/** Read a file out of the Python FS as a Blob, for download. */
export function fileToBlob(pyodide, path, type) {
  const ext = getFileExtension(path);
  const data = pyodide.FS.readFile(path);
  return new Blob([data], { type: type || mimeForExtension(ext) });
}

/** Run a Python snippet with `args_ns` bound to the given argument object. */
export function runWithArgs(pyodide, imports, body, args) {
  const payload = JSON.stringify(JSON.stringify(args));
  return pyodide.runPythonAsync(`
import json
from types import SimpleNamespace
${imports}

args_dict = json.loads(${payload})
args_ns = SimpleNamespace(**args_dict)

${body}
`);
}
