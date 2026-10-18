"use client";

import { useActionState } from "react";
import {
  addCategory,
  addSubcategory,
  setCategoryArchived,
  setSubcategoryArchived,
  updateCategory,
  updateSubcategory,
} from "@/app/actions";
import { SubmitButton } from "@/components/submit-button";
import type { Category, FormState } from "@/lib/types";

type Action = (prev: FormState, fd: FormData) => Promise<FormState>;

function MiniForm({
  action,
  className = "",
  children,
}: {
  action: Action;
  className?: string;
  children: React.ReactNode;
}) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className={className}>
      {children}
      {state && (
        <p className={`basis-full text-xs ${state.ok ? "text-teal" : "text-coral"}`}>{state.message}</p>
      )}
    </form>
  );
}

const input = "min-w-0 rounded-lg border border-line bg-white px-2.5 py-2 outline-none focus:border-teal";
const smallBtn = "!rounded-lg !px-3 !py-2 text-sm";

export function CategoryManager({ categories }: { categories: Category[] }) {
  return (
    <div className="space-y-3">
      {categories.map((c) => (
        <details
          key={c.id}
          className={`overflow-hidden rounded-2xl bg-white shadow-sm ${c.is_archived ? "opacity-60" : ""}`}
        >
          <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3">
            <span className="font-medium">
              {c.name}
              {c.is_archived && <span className="ml-2 text-xs text-muted">(hidden)</span>}
            </span>
            <span className="text-xs text-muted">
              {c.subcategories.filter((s) => !s.is_archived).length} sub ·{" "}
              {c.monthly_budget ? `$${c.monthly_budget}/mo` : "no budget"}
            </span>
          </summary>

          <div className="space-y-4 border-t border-line px-4 py-4">
            <MiniForm action={updateCategory} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="id" value={c.id} />
              <input name="name" defaultValue={c.name} aria-label="Category name" className={`${input} flex-1`} />
              <input
                name="monthly_budget"
                defaultValue={c.monthly_budget ?? ""}
                inputMode="decimal"
                placeholder="Budget $/mo"
                aria-label="Monthly budget"
                className={`${input} w-28`}
              />
              <SubmitButton pendingText="…" className={`${smallBtn} bg-navy text-white`}>
                Save
              </SubmitButton>
            </MiniForm>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Sub-categories</p>
              <ul className="space-y-2">
                {c.subcategories.map((s) => (
                  <li key={s.id} className={s.is_archived ? "opacity-60" : ""}>
                    <div className="flex items-start gap-2">
                      <MiniForm action={updateSubcategory} className="flex flex-1 flex-wrap gap-2">
                        <input type="hidden" name="id" value={s.id} />
                        <input name="name" defaultValue={s.name} aria-label="Sub-category name" className={`${input} flex-1`} />
                        <SubmitButton pendingText="…" className={`${smallBtn} border border-line bg-white text-navy`}>
                          Save
                        </SubmitButton>
                      </MiniForm>
                      <MiniForm action={setSubcategoryArchived}>
                        <input type="hidden" name="id" value={s.id} />
                        <input type="hidden" name="archived" value={String(!s.is_archived)} />
                        <SubmitButton pendingText="…" className={`${smallBtn} bg-canvas text-muted`}>
                          {s.is_archived ? "Restore" : "Hide"}
                        </SubmitButton>
                      </MiniForm>
                    </div>
                  </li>
                ))}
              </ul>
              <MiniForm action={addSubcategory} className="mt-3 flex flex-wrap gap-2">
                <input type="hidden" name="category_id" value={c.id} />
                <input name="name" placeholder="New sub-category" aria-label="New sub-category" className={`${input} flex-1`} />
                <SubmitButton pendingText="…" className={`${smallBtn} bg-teal text-white`}>
                  Add
                </SubmitButton>
              </MiniForm>
            </div>

            <MiniForm action={setCategoryArchived}>
              <input type="hidden" name="id" value={c.id} />
              <input type="hidden" name="archived" value={String(!c.is_archived)} />
              <SubmitButton pendingText="…" className={`${smallBtn} w-full bg-canvas text-muted`}>
                {c.is_archived ? "Restore category" : "Hide category (keeps its history)"}
              </SubmitButton>
            </MiniForm>
          </div>
        </details>
      ))}

      <MiniForm action={addCategory} className="flex flex-wrap gap-2 rounded-2xl bg-white p-4 shadow-sm">
        <p className="basis-full text-sm font-semibold text-navy">Add a category</p>
        <input name="name" placeholder="Category name" aria-label="New category name" className={`${input} flex-1`} />
        <input name="monthly_budget" inputMode="decimal" placeholder="Budget $/mo" aria-label="Monthly budget" className={`${input} w-28`} />
        <SubmitButton pendingText="…" className={`${smallBtn} bg-teal text-white`}>
          Add
        </SubmitButton>
      </MiniForm>
    </div>
  );
}
