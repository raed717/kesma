/** A plain table for CSV / spreadsheet exports. Numbers stay numbers (sortable in Excel). */
export type Cell = string | number | boolean | null;

export type Table = {
  /** Sheet name (spreadsheets) or file-name suffix (CSV). */
  name: string;
  columns: string[];
  rows: Cell[][];
};

function csvCell(value: Cell): string {
  if (value === null) return "";
  const text = typeof value === "number" ? String(round(value)) : String(value);
  return /[",\r\n]/.test(text) || /^\s|\s$/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Avoids 0.30000000000000004 in exported files. */
export function round(value: number, decimals = 6): number {
  if (!Number.isFinite(value)) return value;
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

/**
 * RFC 4180 CSV with a UTF-8 BOM (so Excel reads Arabic/accents correctly) and CRLF lines.
 */
export function toCsv(table: Table): string {
  const lines = [table.columns, ...table.rows].map((row) => row.map(csvCell).join(","));
  return `﻿${lines.join("\r\n")}\r\n`;
}
