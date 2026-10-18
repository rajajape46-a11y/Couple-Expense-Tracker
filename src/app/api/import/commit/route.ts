import { revalidatePath } from "next/cache";
import { getCategories, getContext } from "@/lib/data";
import { classifyAgainstStored, sanitizeRows } from "@/lib/excel/import-service";

/**
 * Saves an import. Everything is re-checked against the database here (not
 * trusted from the preview), so duplicates are skipped even if something was
 * added in the meantime.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const rows = sanitizeRows(body.rows);
    const fileName = typeof body.fileName === "string" ? body.fileName.slice(0, 200) : "import.xlsx";
    const { supabase } = await getContext();

    if (body.createMissing === true) {
      const { missing } = await classifyAgainstStored(rows);
      for (const m of missing) {
        const cats = await getCategories(true);
        let cat = cats.find((c) => c.name.toLowerCase() === m.category.toLowerCase());
        if (!cat) {
          const order = Math.max(0, ...cats.map((c) => c.sort_order)) + 1;
          const { error } = await supabase.from("categories").insert({ name: m.category, sort_order: order });
          if (error && error.code !== "23505") throw new Error(error.message);
          cat = (await getCategories(true)).find((c) => c.name.toLowerCase() === m.category.toLowerCase());
        }
        if (cat && m.subcategory && !cat.subcategories.some((s) => s.name.toLowerCase() === m.subcategory.toLowerCase())) {
          const order = Math.max(0, ...cat.subcategories.map((s) => s.sort_order)) + 1;
          const { error } = await supabase
            .from("subcategories")
            .insert({ category_id: cat.id, name: m.subcategory, sort_order: order });
          if (error && error.code !== "23505") throw new Error(error.message);
        }
      }
    }

    const { items } = await classifyAgainstStored(rows);
    const toAdd = items.flatMap((i) => (i.status === "new" ? [i.row] : []));
    const duplicates = items.filter((i) => i.status === "duplicate").length;
    const problems = items.filter((i) => i.status === "problem").length;

    const { data: importId, error } = await supabase.rpc("import_transactions", {
      p_file_name: fileName,
      p_rows: toAdd,
      p_skipped: duplicates + problems,
    });
    if (error) throw new Error(error.message);

    revalidatePath("/", "layout");
    return Response.json({ importId, added: toAdd.length, duplicates, problems });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
