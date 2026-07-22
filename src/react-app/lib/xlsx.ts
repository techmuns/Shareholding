// Minimal, dependency-free .xlsx (OOXML SpreadsheetML) writer.
//
// Produces a genuine multi-sheet Excel workbook that Excel/LibreOffice/Numbers
// open natively — no external library (so no third-party CVEs), and small: it
// uses inline strings (no shared-strings table), no styles, and a store-only
// (uncompressed) ZIP container. Strings stay strings; finite numbers become
// numeric cells. Everything here runs client-side in the browser.

export type CellValue = string | number | null | undefined;

export interface Sheet {
  /** Tab name (Excel trims to 31 chars and forbids []:*?/\ — sanitized here). */
  name: string;
  /** Rows of cells; ragged rows are fine (empty cells are simply omitted). */
  rows: CellValue[][];
}

// ---------------------------------------------------------------------------
// XML helpers
// ---------------------------------------------------------------------------

/** Escape text for XML and drop characters not allowed in XML 1.0. */
function xmlEscape(value: string): string {
  return value
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 0 -> "A", 25 -> "Z", 26 -> "AA", … (spreadsheet column names). */
function columnName(index: number): string {
  let n = index;
  let name = "";
  do {
    name = String.fromCharCode(65 + (n % 26)) + name;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return name;
}

function sanitizeSheetName(name: string, fallback: string): string {
  const cleaned = name.replace(/[[\]:*?/\\]/g, " ").trim().slice(0, 31);
  return cleaned || fallback;
}

function cellXml(value: CellValue, ref: string): string {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "number" && Number.isFinite(value)) {
    return `<c r="${ref}"><v>${value}</v></c>`;
  }
  const text = xmlEscape(String(value));
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${text}</t></is></c>`;
}

function sheetXml(rows: CellValue[][]): string {
  const body = rows
    .map((row, r) => {
      const cells = row
        .map((v, c) => cellXml(v, `${columnName(c)}${r + 1}`))
        .join("");
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join("");
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetData>${body}</sheetData></worksheet>`
  );
}

// ---------------------------------------------------------------------------
// ZIP (store / no compression) with CRC-32
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

interface ZipEntry {
  name: string;
  data: Uint8Array;
}

function pushU16(out: number[], v: number): void {
  out.push(v & 0xff, (v >>> 8) & 0xff);
}
function pushU32(out: number[], v: number): void {
  out.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff);
}
function pushBytes(out: number[], bytes: Uint8Array): void {
  for (let i = 0; i < bytes.length; i++) out.push(bytes[i]);
}

/** Build a store-only ZIP archive from the given entries. */
function zip(entries: ZipEntry[]): Uint8Array {
  const encoder = new TextEncoder();
  const local: number[] = [];
  const central: number[] = [];
  // Fixed DOS timestamp (1980-01-01 00:00) — keeps output deterministic.
  const DOS_TIME = 0;
  const DOS_DATE = 0x0021;

  const offsets: number[] = [];
  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const crc = crc32(entry.data);
    const size = entry.data.length;
    offsets.push(local.length);

    // Local file header
    pushU32(local, 0x04034b50);
    pushU16(local, 20); // version needed
    pushU16(local, 0); // flags
    pushU16(local, 0); // method: store
    pushU16(local, DOS_TIME);
    pushU16(local, DOS_DATE);
    pushU32(local, crc);
    pushU32(local, size); // compressed
    pushU32(local, size); // uncompressed
    pushU16(local, nameBytes.length);
    pushU16(local, 0); // extra len
    pushBytes(local, nameBytes);
    pushBytes(local, entry.data);
  }

  entries.forEach((entry, i) => {
    const nameBytes = encoder.encode(entry.name);
    const crc = crc32(entry.data);
    const size = entry.data.length;

    pushU32(central, 0x02014b50);
    pushU16(central, 20); // version made by
    pushU16(central, 20); // version needed
    pushU16(central, 0); // flags
    pushU16(central, 0); // method
    pushU16(central, DOS_TIME);
    pushU16(central, DOS_DATE);
    pushU32(central, crc);
    pushU32(central, size);
    pushU32(central, size);
    pushU16(central, nameBytes.length);
    pushU16(central, 0); // extra
    pushU16(central, 0); // comment
    pushU16(central, 0); // disk number start
    pushU16(central, 0); // internal attrs
    pushU32(central, 0); // external attrs
    pushU32(central, offsets[i]); // local header offset
    pushBytes(central, nameBytes);
  });

  const eocd: number[] = [];
  pushU32(eocd, 0x06054b50);
  pushU16(eocd, 0); // disk number
  pushU16(eocd, 0); // disk with central dir
  pushU16(eocd, entries.length);
  pushU16(eocd, entries.length);
  pushU32(eocd, central.length);
  pushU32(eocd, local.length); // central dir offset
  pushU16(eocd, 0); // comment length

  return Uint8Array.from([...local, ...central, ...eocd]);
}

// ---------------------------------------------------------------------------
// Workbook assembly
// ---------------------------------------------------------------------------

/** Build an .xlsx Blob from the given sheets (at least one sheet required). */
export function buildXlsxBlob(sheets: Sheet[]): Blob {
  const encoder = new TextEncoder();
  const used = sheets.length > 0 ? sheets : [{ name: "Sheet1", rows: [] }];

  const names = used.map((s, i) => sanitizeSheetName(s.name, `Sheet${i + 1}`));

  const contentTypes =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    used
      .map(
        (_, i) =>
          `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
      )
      .join("") +
    `</Types>`;

  const rootRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
    `</Relationships>`;

  const workbook =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheets>` +
    names.map((n, i) => `<sheet name="${xmlEscape(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("") +
    `</sheets></workbook>`;

  const workbookRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    used
      .map(
        (_, i) =>
          `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
      )
      .join("") +
    `</Relationships>`;

  const entries: ZipEntry[] = [
    { name: "[Content_Types].xml", data: encoder.encode(contentTypes) },
    { name: "_rels/.rels", data: encoder.encode(rootRels) },
    { name: "xl/workbook.xml", data: encoder.encode(workbook) },
    { name: "xl/_rels/workbook.xml.rels", data: encoder.encode(workbookRels) },
    ...used.map((s, i) => ({
      name: `xl/worksheets/sheet${i + 1}.xml`,
      data: encoder.encode(sheetXml(s.rows)),
    })),
  ];

  // `.buffer` is a plain ArrayBuffer here; the cast satisfies the BlobPart type
  // (TS widens Uint8Array's backing store to ArrayBufferLike).
  const bytes = zip(entries);
  return new Blob([bytes.buffer as ArrayBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/** Trigger a client-side download of a Blob as `filename`. */
export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
