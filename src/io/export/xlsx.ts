/**
 * Minimal Office Open XML (.xlsx) writer: one sheet per table, a bold frozen header row,
 * inline strings and plain numbers. Enough for allocation/comparison exports without a
 * spreadsheet library (JSZip is already used for KMZ/shapefile import, and lazy-loaded).
 */
import { round, type Cell, type Table } from "./table";

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const NS_MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const NS_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const NS_PKG_REL = "http://schemas.openxmlformats.org/package/2006/relationships";

export function escapeXml(text: string): string {
  return (
    text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      // Control characters are not allowed in XML 1.0.
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
  );
}

/** 0 → A, 25 → Z, 26 → AA… */
export function columnName(index: number): string {
  let name = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  }
  return name;
}

/** Sheet names: max 31 chars, no []:*?/\ and unique within the workbook. */
export function sheetNames(tables: Table[]): string[] {
  const used = new Set<string>();
  return tables.map((t, i) => {
    const base = (t.name.replace(/[[\]:*?/\\]/g, " ").trim() || `Sheet${i + 1}`).slice(0, 31);
    let name = base;
    for (let n = 2; used.has(name.toLowerCase()); n++) {
      const suffix = ` (${n})`;
      name = base.slice(0, 31 - suffix.length) + suffix;
    }
    used.add(name.toLowerCase());
    return name;
  });
}

function cellXml(value: Cell, ref: string, header: boolean): string {
  const style = header ? ' s="1"' : "";
  if (value === null || value === "") return "";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return `<c r="${ref}" t="inlineStr"${style}><is><t>∞</t></is></c>`;
    return `<c r="${ref}"${style}><v>${round(value)}</v></c>`;
  }
  if (typeof value === "boolean") return `<c r="${ref}" t="b"${style}><v>${value ? 1 : 0}</v></c>`;
  return `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
}

function sheetXml(table: Table, rtl: boolean): string {
  const rows = [table.columns, ...table.rows];
  const widths = table.columns.map((_, c) =>
    Math.min(60, Math.max(8, ...rows.map((r) => String(r[c] ?? "").length + 2))),
  );
  const cols = widths
    .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
    .join("");
  const data = rows
    .map(
      (row, r) =>
        `<row r="${r + 1}">${row
          .map((v, c) => cellXml(v, `${columnName(c)}${r + 1}`, r === 0))
          .join("")}</row>`,
    )
    .join("");
  return (
    `${XML_HEADER}<worksheet xmlns="${NS_MAIN}" xmlns:r="${NS_REL}">` +
    `<sheetViews><sheetView workbookViewId="0"${rtl ? ' rightToLeft="1"' : ""}>` +
    `<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
    `<cols>${cols}</cols><sheetData>${data}</sheetData></worksheet>`
  );
}

/** Builds the .xlsx file. `rtl` shows the sheets right-to-left (Arabic). */
export async function toXlsx(tables: Table[], { rtl = false } = {}): Promise<Blob> {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const names = sheetNames(tables);

  zip.file(
    "[Content_Types].xml",
    `${XML_HEADER}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
      `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
      tables
        .map(
          (_, i) =>
            `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
        )
        .join("") +
      `</Types>`,
  );
  zip.file(
    "_rels/.rels",
    `${XML_HEADER}<Relationships xmlns="${NS_PKG_REL}">` +
      `<Relationship Id="rId1" Type="${NS_REL}/officeDocument" Target="xl/workbook.xml"/>` +
      `</Relationships>`,
  );
  zip.file(
    "xl/workbook.xml",
    `${XML_HEADER}<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_REL}"><sheets>` +
      names
        .map((n, i) => `<sheet name="${escapeXml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
        .join("") +
      `</sheets></workbook>`,
  );
  zip.file(
    "xl/_rels/workbook.xml.rels",
    `${XML_HEADER}<Relationships xmlns="${NS_PKG_REL}">` +
      tables
        .map(
          (_, i) =>
            `<Relationship Id="rId${i + 1}" Type="${NS_REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
        )
        .join("") +
      `<Relationship Id="rId${tables.length + 1}" Type="${NS_REL}/styles" Target="styles.xml"/>` +
      `</Relationships>`,
  );
  zip.file(
    "xl/styles.xml",
    `${XML_HEADER}<styleSheet xmlns="${NS_MAIN}">` +
      `<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>` +
      `<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>` +
      `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
      `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
      `<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
      `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>` +
      `</styleSheet>`,
  );
  tables.forEach((table, i) => zip.file(`xl/worksheets/sheet${i + 1}.xml`, sheetXml(table, rtl)));

  return zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    compression: "DEFLATE",
  });
}
