import JSZip from "jszip";

/**
 * Minimal, dependency-light .xlsx reader: returns the cell values of each
 * worksheet (numbers, strings, booleans). It deliberately ignores charts,
 * drawings and styles, so workbooks with dashboards and charts open fine.
 */

export type CellVal = string | number | boolean | null;
export type Sheet = { name: string; cells: Map<number, Map<number, CellVal>>; maxRow: number };

const decode = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|lt|gt|amp|quot|apos);/gi, (_, e: string) => {
    const k = e.toLowerCase();
    if (k === "lt") return "<";
    if (k === "gt") return ">";
    if (k === "amp") return "&";
    if (k === "quot") return '"';
    if (k === "apos") return "'";
    return String.fromCodePoint(k.startsWith("#x") ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10));
  });

const attr = (tag: string, name: string) => {
  const m = tag.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`));
  return m ? decode(m[1]) : null;
};

/** Text of all <t> elements inside a fragment (handles rich-text runs). */
const runsText = (xml: string) => {
  let out = "";
  for (const m of xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) out += m[1];
  // <t/> (self-closing) contributes nothing
  return decode(out);
};

function colNumber(letters: string) {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

export async function readXlsx(buf: ArrayBuffer | Uint8Array): Promise<Sheet[]> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buf);
  } catch {
    throw new Error("That file couldn't be read. Please choose an .xlsx Excel file.");
  }
  const wbXml = await zip.file("xl/workbook.xml")?.async("string");
  if (!wbXml) throw new Error("That file couldn't be read. Please choose an .xlsx Excel file.");

  const relsXml = (await zip.file("xl/_rels/workbook.xml.rels")?.async("string")) ?? "";
  const targets = new Map<string, string>();
  for (const m of relsXml.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = attr(m[0], "Id");
    const target = attr(m[0], "Target");
    if (id && target) targets.set(id, target.startsWith("/") ? target.slice(1) : `xl/${target}`);
  }

  const shared: string[] = [];
  const ssXml = await zip.file("xl/sharedStrings.xml")?.async("string");
  if (ssXml) for (const m of ssXml.matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push(runsText(m[1]));

  const sheets: Sheet[] = [];
  for (const m of wbXml.matchAll(/<sheet\b[^>]*>/g)) {
    const name = attr(m[0], "name") ?? "";
    const rid = attr(m[0], "r:id");
    const path = rid ? targets.get(rid) : undefined;
    const xml = path ? await zip.file(path)?.async("string") : undefined;
    const cells = new Map<number, Map<number, CellVal>>();
    let maxRow = 0;
    if (xml) {
      for (const c of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const ref = attr(c[1], "r");
        if (!ref || !c[2]) continue;
        const rm = ref.match(/^([A-Z]+)(\d+)$/);
        if (!rm) continue;
        const t = attr(c[1], "t") ?? "n";
        const v = c[2].match(/<v>([\s\S]*?)<\/v>/)?.[1];
        let value: CellVal = null;
        if (t === "s" && v !== undefined) value = shared[Number(v)] ?? null;
        else if (t === "inlineStr") value = runsText(c[2].match(/<is>([\s\S]*?)<\/is>/)?.[1] ?? "");
        else if (t === "str") value = v !== undefined ? decode(v) : null;
        else if (t === "b") value = v === "1";
        else if (t === "e") value = null;
        else if (v !== undefined && v !== "") value = Number(v);
        if (value === null || value === "") continue;
        const row = Number(rm[2]);
        if (!cells.has(row)) cells.set(row, new Map());
        cells.get(row)!.set(colNumber(rm[1]), value);
        if (row > maxRow) maxRow = row;
      }
    }
    sheets.push({ name, cells, maxRow });
  }
  return sheets;
}
