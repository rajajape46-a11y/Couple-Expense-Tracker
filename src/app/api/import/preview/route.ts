import { classifyAgainstStored } from "@/lib/excel/import-service";
import { parseWorkbook } from "@/lib/excel/parse";

const MAX_BYTES = 4 * 1024 * 1024;

/** Reads an uploaded workbook and reports what an import would do. Saves nothing. */
export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return Response.json({ error: "Choose a file first." }, { status: 400 });
    if (file.size > MAX_BYTES) return Response.json({ error: "That file is larger than 4 MB." }, { status: 400 });

    const { rows, sheet } = await parseWorkbook(await file.arrayBuffer());
    const { items, missing } = await classifyAgainstStored(rows);

    const pick = (status: string) => items.filter((i) => i.status === status);
    const brief = (i: (typeof items)[number]) => ({
      line: i.raw.line,
      date: i.raw.date,
      merchant: i.raw.merchant,
      amount: i.raw.amount,
      category: i.raw.category,
      ...(i.status === "problem" ? { reasons: i.reasons } : {}),
    });
    return Response.json({
      fileName: file.name,
      sheet,
      rows, // sent back unchanged when the import is confirmed
      counts: {
        total: items.length,
        new: pick("new").length,
        duplicate: pick("duplicate").length,
        problem: pick("problem").length,
      },
      newRows: pick("new").map(brief),
      duplicates: pick("duplicate").map(brief),
      problems: pick("problem").map(brief),
      missing,
    });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
