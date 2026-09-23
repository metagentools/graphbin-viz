/**
 * Guards on the uploaded files.
 *
 * Everything runs in the browser, so an oversized assembly is not a server
 * problem — it is a tab that stops responding. Each check returns the message
 * to show rather than showing it, so the caller decides how to surface it.
 */

import { MAX_CONTIGS, MAX_FILE_BYTES } from "../constants/graph.js";

const CONTIG_EXTENSIONS = [".fasta", ".fa", ".fna"];
const RESULT_EXTENSIONS = [".csv", ".tsv"];

const hasExtension = (file, extensions) =>
  extensions.some((ext) => file.name.toLowerCase().endsWith(ext));

export function countFastaContigs(text) {
  let count = 0;
  for (const line of String(text || "").split(/\r?\n/)) {
    if (line.startsWith(">")) count += 1;
  }
  return count;
}

export function validateGraphFile(file) {
  if (!file) return null;
  if (!file.name.toLowerCase().endsWith(".gfa")) {
    return "Please upload a valid GFA file ending with .gfa.";
  }
  if (file.size > MAX_FILE_BYTES) {
    return "GFA file is too large! Maximum allowed size is 200 MB.";
  }
  return null;
}

export async function validateContigsFile(file) {
  if (!file) return null;
  if (!hasExtension(file, CONTIG_EXTENSIONS)) {
    return "Please upload a contigs file ending with .fasta, .fa, or .fna.";
  }
  if (file.size > MAX_FILE_BYTES) {
    return "Contigs file is too large! Maximum allowed size is 200 MB.";
  }

  let count;
  try {
    count = countFastaContigs(await file.text());
  } catch (e) {
    return "Failed to read contigs file. Please upload a valid FASTA file.";
  }
  if (count > MAX_CONTIGS) {
    return `Contigs file has ${count.toLocaleString()} contigs. Maximum allowed is ${MAX_CONTIGS.toLocaleString()}.`;
  }
  return null;
}

export function validateInitialFile(file) {
  if (!file) return null;
  if (!hasExtension(file, RESULT_EXTENSIONS)) {
    return "Please upload an initial binning result file ending with .csv or .tsv.";
  }
  return null;
}
