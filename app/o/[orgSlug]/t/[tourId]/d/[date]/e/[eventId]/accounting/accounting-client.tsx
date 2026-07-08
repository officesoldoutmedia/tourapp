"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  computeSettlement,
  evalExpenseFormula,
  type SettlementInput,
} from "@/lib/settlement";
import {
  copyFromEvent,
  deleteExpense,
  deleteLineItem,
  deleteTicketSale,
  updateSettlement,
  upsertExpense,
  upsertLineItem,
  upsertTicketSale,
} from "./actions";

export interface SettlementRow {
  currency: string;
  deal_type: string | null;
  guarantee: number | null;
  split_percent_artist: number | null;
  venue_capacity: number | null;
  tickets_sold: number | null;
  comps: number | null;
  gross_ticket_sales: number | null;
  taxes_fees: number | null;
  total_expenses: number | null;
  overage: number | null;
  production_reimbursements: number | null;
  additional_chargebacks: number | null;
  deposit: number | null;
  withholding: number | null;
  cash: number | null;
  ticket_buys: number | null;
  night_of_show_deductions: number | null;
  total_merch_sales: number | null;
}

export interface TicketRow {
  id: string;
  label: string;
  capacity: number | null;
  comps: number;
  kills: number;
  scans: number;
  sold: number;
  gross_price: number | null;
}

export interface ExpenseRow {
  id: string;
  stage: "pre_split" | "post_split" | "withholding";
  label: string;
  formula: string | null;
  amount: number | null;
}

export interface LineItemRow {
  id: string;
  category: string | null;
  description: string | null;
  income: number;
  expense: number;
}

interface Ctx {
  orgSlug: string;
  tourId: string;
  date: string;
  eventId: string;
}

const num = (v: number | null | undefined) => v ?? 0;
const fmt = (v: number) =>
  v.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function AccountingClient({
  ctx,
  settlement,
  tickets,
  expenses,
  lineItems,
  otherEvents,
  canEdit,
}: {
  ctx: Ctx;
  settlement: SettlementRow;
  tickets: TicketRow[];
  expenses: ExpenseRow[];
  lineItems: LineItemRow[];
  otherEvents: { id: string; label: string }[];
  canEdit: boolean;
}) {
  const t = useTranslations("accounting");
  const [tab, setTab] = useState<"settlement" | "tickets" | "expenses" | "line_items">("settlement");
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<{ error?: string }>) {
    startTransition(async () => {
      await fn();
    });
  }

  const input: SettlementInput = {
    dealType: settlement.deal_type,
    guarantee: num(settlement.guarantee),
    splitPercentArtist: num(settlement.split_percent_artist),
    venueCapacity: settlement.venue_capacity,
    ticketsSold: settlement.tickets_sold,
    grossTicketSales: num(settlement.gross_ticket_sales),
    taxesFees: num(settlement.taxes_fees),
    totalExpenses: num(settlement.total_expenses),
    overageOverride: settlement.overage,
    productionReimbursements: num(settlement.production_reimbursements),
    additionalChargebacks: num(settlement.additional_chargebacks),
    deposit: num(settlement.deposit),
    withholding: num(settlement.withholding),
    cash: num(settlement.cash),
    ticketBuys: num(settlement.ticket_buys),
    nightOfShowDeductions: num(settlement.night_of_show_deductions),
  };
  const result = computeSettlement(input);

  const preSplitSum = expenses
    .filter((e) => e.stage === "pre_split")
    .reduce((s, e) => s + num(e.amount), 0);

  function saveField(field: string, raw: string) {
    const value = raw === "" ? null : Number(raw);
    run(() => updateSettlement(ctx.orgSlug, ctx.tourId, ctx.date, ctx.eventId, { [field]: value }));
  }

  const inputCls =
    "w-28 rounded border border-hairline px-2 py-1 text-right text-sm read-only:bg-subtle";
  const computedCls = "w-28 px-2 py-1 text-right text-sm font-bold";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <nav className="flex gap-1 text-sm">
          {(["settlement", "tickets", "expenses", "line_items"] as const).map((tb) => (
            <button
              key={tb}
              onClick={() => setTab(tb)}
              className={`rounded px-3 py-1.5 font-medium ${tab === tb ? "bg-accent hover:bg-accent-hover text-white" : "bg-inset text-secondary"}`}
            >
              {t(`tab_${tb}`)}
            </button>
          ))}
        </nav>
        <span className="ml-auto flex items-center gap-2 text-xs">
          <select
            value={settlement.currency}
            disabled={!canEdit || pending}
            onChange={(e) =>
              run(() =>
                updateSettlement(ctx.orgSlug, ctx.tourId, ctx.date, ctx.eventId, {
                  currency: e.target.value,
                }),
              )
            }
            className="rounded border border-hairline px-2 py-1"
          >
            {["EUR", "RON", "USD", "GBP"].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          {canEdit && otherEvents.length > 0 && (
            <select
              value=""
              disabled={pending}
              onChange={(e) => {
                if (e.target.value)
                  run(() => copyFromEvent(ctx.orgSlug, ctx.tourId, ctx.date, ctx.eventId, e.target.value));
              }}
              className="rounded border border-hairline px-2 py-1"
            >
              <option value="">{t("copyFrom")}…</option>
              {otherEvents.map((ev) => (
                <option key={ev.id} value={ev.id}>{ev.label}</option>
              ))}
            </select>
          )}
          <a
            href={`/api/csv/settlement/${ctx.eventId}`}
            className="rounded border border-hairline px-2 py-1 font-medium"
          >
            CSV
          </a>
          <a
            href={`/api/pdf/settlement/${ctx.eventId}`}
            target="_blank"
            className="rounded border border-hairline px-2 py-1 font-medium"
          >
            PDF
          </a>
        </span>
      </div>

      {tab === "settlement" && (
        <div className="max-w-md space-y-1">
          {/* ordinea vizuală = ordinea calculului [C §6.12 avertisment] */}
          {(
            [
              ["venue_capacity", t("venueCapacity"), "input"],
              ["tickets_sold", t("ticketsSold"), "input"],
              ["__pct", t("percentOfCapacity"), "computed"],
              ["comps", t("comps"), "input"],
              ["gross_ticket_sales", t("grossTicketSales"), "input"],
              ["taxes_fees", `− ${t("taxesFees")}`, "input"],
              ["__net", `= ${t("netTicketSales")}`, "computed"],
              ["total_expenses", `− ${t("totalExpenses")}`, "input"],
              ["__pot", `= ${t("amountToPot")}`, "computed"],
              ["guarantee", t("guarantee"), "input"],
              ["split_percent_artist", t("splitPercent"), "input"],
              ["__overage", t("overage"), "computed"],
              ["__walkout", t("walkout"), "computed"],
              ["production_reimbursements", `+ ${t("productionReimbursements")}`, "input"],
              ["additional_chargebacks", `+ ${t("additionalChargebacks")}`, "input"],
              ["deposit", `− ${t("deposit")}`, "input"],
              ["withholding", `− ${t("withholding")}`, "input"],
              ["cash", `− ${t("cash")}`, "input"],
              ["ticket_buys", `− ${t("ticketBuys")}`, "input"],
              ["night_of_show_deductions", `− ${t("nosDeductions")}`, "input"],
              ["__due", `= ${t("amountDue")}`, "computed"],
              ["total_merch_sales", t("totalMerchSales"), "input"],
            ] as const
          ).map(([field, label, kind]) => {
            const computedValue =
              field === "__pct"
                ? result.percentOfCapacity != null
                  ? `${result.percentOfCapacity}%`
                  : "—"
                : field === "__net"
                  ? fmt(result.netTicketSales)
                  : field === "__pot"
                    ? fmt(result.amountToPot)
                    : field === "__overage"
                      ? fmt(result.overage)
                      : field === "__walkout"
                        ? fmt(result.walkout)
                        : field === "__due"
                          ? fmt(result.amountDue)
                          : null;
            const highlight = field === "__pot" || field === "__due";
            return (
              <div
                key={field}
                className={`flex items-center justify-between gap-3 rounded px-2 ${highlight ? "bg-inset py-1.5" : ""}`}
              >
                <span className={`text-sm ${kind === "computed" ? "font-semibold" : "text-secondary"}`}>
                  {label}
                </span>
                {kind === "computed" ? (
                  <span className={computedCls}>{computedValue}</span>
                ) : (
                  <input
                    type="number"
                    step="any"
                    readOnly={!canEdit}
                    defaultValue={settlement[field as keyof SettlementRow] ?? ""}
                    onBlur={(e) => {
                      const current = settlement[field as keyof SettlementRow];
                      if (canEdit && e.target.value !== String(current ?? ""))
                        saveField(field, e.target.value);
                    }}
                    className={inputCls}
                  />
                )}
              </div>
            );
          })}
          <p className="pt-2 text-xs text-tertiary">{t("expensesHint", { sum: fmt(preSplitSum) })}</p>
        </div>
      )}

      {tab === "tickets" && (
        <TicketsGrid ctx={ctx} tickets={tickets} canEdit={canEdit} pending={pending} run={run} />
      )}

      {tab === "expenses" && (
        <ExpensesGrid
          ctx={ctx}
          expenses={expenses}
          gross={num(settlement.gross_ticket_sales)}
          net={result.netTicketSales}
          canEdit={canEdit}
          pending={pending}
          run={run}
        />
      )}

      {tab === "line_items" && (
        <LineItemsGrid ctx={ctx} items={lineItems} canEdit={canEdit} pending={pending} run={run} />
      )}
    </div>
  );
}

function TicketsGrid({
  ctx, tickets, canEdit, pending, run,
}: {
  ctx: Ctx;
  tickets: TicketRow[];
  canEdit: boolean;
  pending: boolean;
  run: (fn: () => Promise<{ error?: string }>) => void;
}) {
  const t = useTranslations("accounting");
  const empty = { label: "", capacity: "", comps: "", kills: "", scans: "", sold: "", grossPrice: "" };
  const [draft, setDraft] = useState(empty);

  const total = (key: "comps" | "kills" | "scans" | "sold") =>
    tickets.reduce((s, r) => s + r[key], 0);
  const grossTotal = tickets.reduce((s, r) => s + r.sold * num(r.gross_price), 0);

  return (
    <div className="overflow-x-auto">
      <table className="w-full max-w-3xl text-sm">
        <thead className="text-left text-xs uppercase text-secondary">
          <tr>
            {["type", "capacity", "comps", "kills", "scans", "sold", "grossPrice", "grossTotal"].map((h) => (
              <th key={h} className="px-2 py-1">{t(h)}</th>
            ))}
            <th />
          </tr>
        </thead>
        <tbody className="divide-y divide-hairline">
          {tickets.map((row) => (
            <tr key={row.id}>
              <td className="px-2 py-1 font-medium">{row.label}</td>
              <td className="px-2 py-1">{row.capacity ?? "—"}</td>
              <td className="px-2 py-1">{row.comps}</td>
              <td className="px-2 py-1">{row.kills}</td>
              <td className="px-2 py-1">{row.scans}</td>
              <td className="px-2 py-1">{row.sold}</td>
              <td className="px-2 py-1">{row.gross_price ?? "—"}</td>
              <td className="px-2 py-1">{fmt(row.sold * num(row.gross_price))}</td>
              <td className="px-2 py-1">
                {canEdit && (
                  <button
                    disabled={pending}
                    onClick={() => run(() => deleteTicketSale(ctx.orgSlug, ctx.tourId, ctx.date, ctx.eventId, row.id))}
                    className="text-xs text-danger"
                  >
                    🗑
                  </button>
                )}
              </td>
            </tr>
          ))}
          {canEdit && (
            <tr>
              {(["label", "capacity", "comps", "kills", "scans", "sold", "grossPrice"] as const).map((key) => (
                <td key={key} className="px-2 py-1">
                  <input
                    value={draft[key]}
                    onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                    className="w-16 rounded border border-hairline px-1.5 py-0.5 text-xs"
                    placeholder={key === "label" ? "GA" : ""}
                  />
                </td>
              ))}
              <td />
              <td className="px-2 py-1">
                <button
                  disabled={pending || !draft.label.trim()}
                  onClick={() =>
                    run(async () => {
                      const r = await upsertTicketSale(ctx.orgSlug, ctx.tourId, ctx.date, ctx.eventId, {
                        label: draft.label,
                        capacity: draft.capacity ? Number(draft.capacity) : null,
                        comps: Number(draft.comps) || 0,
                        kills: Number(draft.kills) || 0,
                        scans: Number(draft.scans) || 0,
                        sold: Number(draft.sold) || 0,
                        grossPrice: draft.grossPrice ? Number(draft.grossPrice) : null,
                      });
                      if (!r.error) setDraft(empty);
                      return r;
                    })
                  }
                  className="rounded bg-accent hover:bg-accent-hover px-2 py-0.5 text-xs text-white disabled:opacity-40"
                >
                  +
                </button>
              </td>
            </tr>
          )}
        </tbody>
        <tfoot className="bg-subtle font-medium">
          <tr>
            <td className="px-2 py-1">Σ</td>
            <td />
            <td className="px-2 py-1">{total("comps")}</td>
            <td className="px-2 py-1">{total("kills")}</td>
            <td className="px-2 py-1">{total("scans")}</td>
            <td className="px-2 py-1">{total("sold")}</td>
            <td />
            <td className="px-2 py-1">{fmt(grossTotal)}</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function ExpensesGrid({
  ctx, expenses, gross, net, canEdit, pending, run,
}: {
  ctx: Ctx;
  expenses: ExpenseRow[];
  gross: number;
  net: number;
  canEdit: boolean;
  pending: boolean;
  run: (fn: () => Promise<{ error?: string }>) => void;
}) {
  const t = useTranslations("accounting");
  const [draft, setDraft] = useState({ stage: "pre_split" as ExpenseRow["stage"], label: "", formula: "" });

  const stages: ExpenseRow["stage"][] = ["pre_split", "post_split", "withholding"];

  return (
    <div className="max-w-2xl space-y-4">
      {/* [C §6.12] ordinea etapelor = ordinea calculului; plasarea greșită
          schimbă cine ce încasează → afișare vizual distinctă */}
      {stages.map((stage, idx) => {
        const rows = expenses.filter((e) => e.stage === stage);
        const sum = rows.reduce((s, e) => s + num(e.amount), 0);
        return (
          <section key={stage} className="rounded-lg border border-hairline bg-surface shadow-xs">
            <header className="flex items-center justify-between border-b border-hairline bg-subtle px-3 py-1.5">
              <span className="text-xs font-bold uppercase tracking-wide">
                {idx + 1}. {t(`stage_${stage}`)}
              </span>
              <span className="text-xs font-medium">{fmt(sum)}</span>
            </header>
            <ul className="divide-y divide-hairline">
              {rows.map((row) => (
                <li key={row.id} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                  <span className="min-w-0 flex-1">{row.label}</span>
                  {row.formula && (
                    <span className="rounded bg-inset px-1.5 text-[10px] text-secondary">
                      {row.formula}
                    </span>
                  )}
                  <span className="w-24 text-right font-medium">{fmt(num(row.amount))}</span>
                  {canEdit && (
                    <button
                      disabled={pending}
                      onClick={() => run(() => deleteExpense(ctx.orgSlug, ctx.tourId, ctx.date, ctx.eventId, row.id))}
                      className="text-xs text-danger"
                    >
                      🗑
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <select
            value={draft.stage}
            onChange={(e) => setDraft({ ...draft, stage: e.target.value as ExpenseRow["stage"] })}
            className="rounded border border-hairline px-2 py-1 text-xs"
          >
            {stages.map((s) => (
              <option key={s} value={s}>{t(`stage_${s}`)}</option>
            ))}
          </select>
          <input
            value={draft.label}
            onChange={(e) => setDraft({ ...draft, label: e.target.value })}
            placeholder={t("expenseLabel")}
            className="min-w-32 flex-1 rounded border border-hairline px-2 py-1 text-xs"
          />
          <input
            value={draft.formula}
            onChange={(e) => setDraft({ ...draft, formula: e.target.value })}
            placeholder={t("formulaHint")}
            className="w-40 rounded border border-hairline px-2 py-1 text-xs"
          />
          <button
            disabled={pending || !draft.label.trim() || !draft.formula.trim()}
            onClick={() =>
              run(async () => {
                const amount = evalExpenseFormula(draft.formula, { gross, net });
                if (amount === null) return { error: "invalid_formula" };
                const r = await upsertExpense(ctx.orgSlug, ctx.tourId, ctx.date, ctx.eventId, {
                  stage: draft.stage,
                  label: draft.label,
                  formula: /%/.test(draft.formula) ? draft.formula : "",
                  amount,
                });
                if (!r.error) setDraft({ ...draft, label: "", formula: "" });
                return r;
              })
            }
            className="rounded bg-accent hover:bg-accent-hover px-3 py-1 text-xs font-medium text-white disabled:opacity-40"
          >
            +
          </button>
        </div>
      )}
    </div>
  );
}

function LineItemsGrid({
  ctx, items, canEdit, pending, run,
}: {
  ctx: Ctx;
  items: LineItemRow[];
  canEdit: boolean;
  pending: boolean;
  run: (fn: () => Promise<{ error?: string }>) => void;
}) {
  const t = useTranslations("accounting");
  const empty = { category: "", description: "", income: "", expense: "" };
  const [draft, setDraft] = useState(empty);

  const totalIncome = items.reduce((s, i) => s + i.income, 0);
  const totalExpense = items.reduce((s, i) => s + i.expense, 0);

  return (
    <div className="max-w-2xl overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase text-secondary">
          <tr>
            <th className="px-2 py-1">{t("category")}</th>
            <th className="px-2 py-1">{t("description")}</th>
            <th className="px-2 py-1 text-right">{t("income")}</th>
            <th className="px-2 py-1 text-right">{t("expense")}</th>
            <th />
          </tr>
        </thead>
        <tbody className="divide-y divide-hairline">
          {items.map((row) => (
            <tr key={row.id}>
              <td className="px-2 py-1">{row.category}</td>
              <td className="px-2 py-1">{row.description}</td>
              <td className="px-2 py-1 text-right">{fmt(row.income)}</td>
              <td className="px-2 py-1 text-right">{fmt(row.expense)}</td>
              <td className="px-2 py-1">
                {canEdit && (
                  <button
                    disabled={pending}
                    onClick={() => run(() => deleteLineItem(ctx.orgSlug, ctx.tourId, ctx.date, ctx.eventId, row.id))}
                    className="text-xs text-danger"
                  >
                    🗑
                  </button>
                )}
              </td>
            </tr>
          ))}
          {canEdit && (
            <tr>
              <td className="px-2 py-1"><input value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} className="w-24 rounded border border-hairline px-1.5 py-0.5 text-xs" /></td>
              <td className="px-2 py-1"><input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} className="w-full rounded border border-hairline px-1.5 py-0.5 text-xs" /></td>
              <td className="px-2 py-1"><input value={draft.income} onChange={(e) => setDraft({ ...draft, income: e.target.value })} className="w-20 rounded border border-hairline px-1.5 py-0.5 text-right text-xs" /></td>
              <td className="px-2 py-1"><input value={draft.expense} onChange={(e) => setDraft({ ...draft, expense: e.target.value })} className="w-20 rounded border border-hairline px-1.5 py-0.5 text-right text-xs" /></td>
              <td className="px-2 py-1">
                <button
                  disabled={pending || (!draft.category.trim() && !draft.description.trim())}
                  onClick={() =>
                    run(async () => {
                      const r = await upsertLineItem(ctx.orgSlug, ctx.tourId, ctx.date, ctx.eventId, {
                        category: draft.category,
                        description: draft.description,
                        income: Number(draft.income) || 0,
                        expense: Number(draft.expense) || 0,
                      });
                      if (!r.error) setDraft(empty);
                      return r;
                    })
                  }
                  className="rounded bg-accent hover:bg-accent-hover px-2 py-0.5 text-xs text-white disabled:opacity-40"
                >
                  +
                </button>
              </td>
            </tr>
          )}
        </tbody>
        {/* [C-S] TOTALINCOMEANDEXPENSE / TOTAL / GRANDTOTAL */}
        <tfoot className="bg-subtle text-sm font-medium">
          <tr>
            <td className="px-2 py-1" colSpan={2}>{t("totalIncomeExpense")}</td>
            <td className="px-2 py-1 text-right">{fmt(totalIncome)}</td>
            <td className="px-2 py-1 text-right">{fmt(totalExpense)}</td>
            <td />
          </tr>
          <tr>
            <td className="px-2 py-1" colSpan={2}>{t("grandTotal")}</td>
            <td className="px-2 py-1 text-right font-bold" colSpan={2}>
              {fmt(totalIncome - totalExpense)}
            </td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
