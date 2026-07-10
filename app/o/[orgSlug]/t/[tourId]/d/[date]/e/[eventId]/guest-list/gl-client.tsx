"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "@/components/ui/Toaster";
import {
  deleteGuestRequests,
  setGuestStatus,
  updateGlSettings,
  upsertGuestRequest,
  upsertPassAllotment,
  type GuestRequestInput,
} from "./actions";

export interface PassType {
  id: string;
  name: string;
}

export interface GlSettings {
  cutoff_at: string | null;
  is_locked: boolean;
  tickets_allotment: number | null;
  tickets_enforced: boolean;
}

export interface PassAllotment {
  pass_type_id: string;
  num_allowed: number;
  enforced: boolean;
}

export interface GuestRow {
  id: string;
  last_name: string;
  first_name: string | null;
  affiliation: string | null;
  num_tickets: number;
  status: "pending" | "approved" | "declined";
  pickup: string | null;
  priority: boolean;
  notes: string | null;
  email_notify: string | null;
  phone: string | null;
  seat_row: string | null;
  seat: string | null;
  requested_by: string | null;
  requestor_name: string;
  requested_at: string;
  passes: Record<string, number>;
}

const PICKUPS = ["will_call", "box_office", "venue", "other"] as const;
type SortKey = "last_name" | "first_name" | "num_tickets" | "status" | "affiliation" | "requestor_name" | "requested_at";

interface Ctx {
  orgSlug: string;
  tourId: string;
  date: string;
  eventId: string;
}

export function GuestListGrid({
  ctx,
  rows,
  passTypes,
  settings,
  allotments,
  canManage,
  canSubmit,
}: {
  ctx: Ctx;
  rows: GuestRow[];
  passTypes: PassType[];
  settings: GlSettings;
  allotments: PassAllotment[];
  canManage: boolean;
  canSubmit: boolean;
}) {
  const t = useTranslations("gl");
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detailId, setDetailId] = useState<string | null>(null);
  const [filters, setFilters] = useState({ requestor: "", status: "", affiliation: "" });
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "requested_at", dir: 1 });

  function run(fn: () => Promise<{ error?: string }>) {
    startTransition(async () => {
      await fn();
    });
  }

  // ── filtre [C] ──
  const filtered = useMemo(() => {
    let out = rows;
    if (filters.requestor) out = out.filter((r) => r.requestor_name === filters.requestor);
    if (filters.status) out = out.filter((r) => r.status === filters.status);
    if (filters.affiliation)
      out = out.filter((r) =>
        (r.affiliation ?? "").toLowerCase().includes(filters.affiliation.toLowerCase()),
      );
    return [...out].sort((a, b) => {
      const av = a[sort.key] ?? "";
      const bv = b[sort.key] ?? "";
      return (av < bv ? -1 : av > bv ? 1 : 0) * sort.dir;
    });
  }, [rows, filters, sort]);

  const requestors = useMemo(
    () => [...new Set(rows.map((r) => r.requestor_name))].sort(),
    [rows],
  );

  // totaluri: selecția filtrată [C]; fără selecție → tot ce e filtrat
  const totalsBase = useMemo(() => {
    const sel = filtered.filter((r) => selected.has(r.id));
    return sel.length > 0 ? sel : filtered;
  }, [filtered, selected]);
  const totalTickets = totalsBase.reduce((sum, r) => sum + r.num_tickets, 0);
  const totalPass = (passId: string) =>
    totalsBase.reduce((sum, r) => sum + (r.passes[passId] ?? 0), 0);

  // consum global (toate requesturile ne-declined) pt Remaining
  const usedTickets = rows.filter((r) => r.status !== "declined").reduce((s, r) => s + r.num_tickets, 0);
  const usedPass = (passId: string) =>
    rows.filter((r) => r.status !== "declined").reduce((s, r) => s + (r.passes[passId] ?? 0), 0);

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((r) => selected.has(r.id));

  const detail = rows.find((r) => r.id === detailId) ?? null;

  return (
    <div className="space-y-3">
      {/* Header: cutoff + locked [C-S] */}
      <div className="flex flex-wrap items-center gap-3 rounded-[12px] border border-hairline bg-surface px-3 py-2 text-xs">
        <label className="flex items-center gap-2 font-semibold uppercase tracking-wide text-secondary">
          {t("cutoff")}
          <input
            type="datetime-local"
            disabled={!canManage}
            defaultValue={settings.cutoff_at ? settings.cutoff_at.slice(0, 16) : ""}
            onBlur={(e) => {
              if (!canManage) return;
              const value = e.target.value ? new Date(e.target.value).toISOString() : null;
              run(() => updateGlSettings(ctx.orgSlug, ctx.tourId, ctx.date, ctx.eventId, { cutoffAt: value }));
            }}
            className="rounded border border-hairline px-2 py-1"
          />
        </label>
        <button
          disabled={!canManage || pending}
          onClick={() =>
            run(() =>
              updateGlSettings(ctx.orgSlug, ctx.tourId, ctx.date, ctx.eventId, {
                isLocked: !settings.is_locked,
              }),
            )
          }
          className={`rounded-full px-3 py-1 font-bold ${settings.is_locked ? "bg-danger text-white" : "border border-hairline text-secondary"}`}
        >
          {settings.is_locked ? `🔒 ${t("locked")}` : `🔓 ${t("unlocked")}`}
        </button>

        {/* filtre [C] */}
        <span className="ml-auto flex flex-wrap items-center gap-2">
          <select value={filters.requestor} onChange={(e) => setFilters({ ...filters, requestor: e.target.value })} className="rounded border border-hairline px-2 py-1">
            <option value="">{t("requestor")}: {t("filterAll")}</option>
            {requestors.map((name) => (<option key={name} value={name}>{name}</option>))}
          </select>
          <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} className="rounded border border-hairline px-2 py-1">
            <option value="">{t("status")}: {t("filterAll")}</option>
            {(["pending", "approved", "declined"] as const).map((s) => (
              <option key={s} value={s}>{t(s)}</option>
            ))}
          </select>
          <input
            value={filters.affiliation}
            onChange={(e) => setFilters({ ...filters, affiliation: e.target.value })}
            placeholder={t("affiliation")}
            className="w-28 rounded border border-hairline px-2 py-1"
          />
        </span>
      </div>

      {/* bara de bulk (Graphite README §11) */}
      {canManage && selected.size > 0 && (
        <div
          className="flex h-10 items-center gap-4 rounded-[10px] px-3.5"
          style={{
            background: "var(--sel-bulk)",
            border: "1px solid var(--sel-bulk-border)",
            animation: "toastIn 160ms ease-out",
          }}
        >
          <span className="text-[12px] font-medium text-primary">
            {t("selectedCount", { count: selected.size })}
          </span>
          <span className="ml-auto flex items-center gap-4 text-[12px]">
            <button
              disabled={pending}
              onClick={() =>
                run(async () => {
                  const count = selected.size;
                  const r = await setGuestStatus(
                    ctx.orgSlug, ctx.tourId, ctx.date, ctx.eventId,
                    [...selected], "approved",
                  );
                  if (!r.error) {
                    setSelected(new Set());
                    toast(t("bulkApproved", { count }));
                  }
                  return r;
                })
              }
              className="font-medium text-accent transition-colors hover:text-accent-hover"
            >
              {t("approved")}
            </button>
            <button
              disabled={pending}
              onClick={() =>
                run(async () => {
                  const count = selected.size;
                  const r = await setGuestStatus(
                    ctx.orgSlug, ctx.tourId, ctx.date, ctx.eventId,
                    [...selected], "declined",
                  );
                  if (!r.error) {
                    setSelected(new Set());
                    toast(t("bulkDeclined", { count }), "warning");
                  }
                  return r;
                })
              }
              className="font-medium text-warning transition-colors hover:text-primary"
            >
              {t("declined")}
            </button>
            <button
              disabled={pending}
              onClick={() =>
                run(async () => {
                  const count = selected.size;
                  const r = await deleteGuestRequests(ctx.orgSlug, ctx.tourId, ctx.date, ctx.eventId, [...selected]);
                  if (!r.error) {
                    setSelected(new Set());
                    toast(t("bulkRemoved", { count }), "danger");
                  }
                  return r;
                })
              }
              className="font-medium text-danger transition-colors hover:text-primary"
            >
              {t("delete")}
            </button>
            <button
              onClick={() => setSelected(new Set())}
              className="text-secondary transition-colors hover:text-primary"
            >
              {t("clearSelection")}
            </button>
          </span>
          <style>{`@keyframes toastIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }`}</style>
        </div>
      )}

      <div className="flex gap-4">
        <div className="min-w-0 flex-1 overflow-x-auto rounded-[12px] border border-hairline bg-surface">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-[2] bg-canvas text-left font-display text-[10px] font-semibold uppercase tracking-[0.07em] text-tertiary">
              <tr>
                <th className="px-2 py-1.5">
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={(e) => {
                      // master checkbox = selecția FILTRATĂ [C]
                      const next = new Set(selected);
                      for (const r of filtered) {
                        if (e.target.checked) next.add(r.id);
                        else next.delete(r.id);
                      }
                      setSelected(next);
                    }}
                  />
                </th>
                {(
                  [
                    ["last_name", t("last")],
                    ["first_name", t("first")],
                    ["num_tickets", t("tix")],
                  ] as [SortKey, string][]
                ).map(([key, label]) => (
                  <SortableTh key={key} label={label} k={key} sort={sort} setSort={setSort} />
                ))}
                {passTypes.map((pass) => (
                  <th key={pass.id} className="px-2 py-1.5">{pass.name}</th>
                ))}
                {(
                  [
                    ["status", t("status")],
                    ["affiliation", t("affiliation")],
                    ["requestor_name", t("requestor")],
                    ["requested_at", t("date")],
                  ] as [SortKey, string][]
                ).map(([key, label]) => (
                  <SortableTh key={key} label={label} k={key} sort={sort} setSort={setSort} />
                ))}
                <th className="px-2 py-1.5">{t("pickup")}</th>
                <th className="px-2 py-1.5">{t("priority")}</th>
                <th className="px-2 py-1.5">{t("notes")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {canSubmit && (
                <NewGuestRow ctx={ctx} passTypes={passTypes} pending={pending} run={run} />
              )}
              {filtered.map((row) => (
                <GuestRowView
                  key={row.id}
                  ctx={ctx}
                  row={row}
                  passTypes={passTypes}
                  canManage={canManage}
                  selected={selected.has(row.id)}
                  onSelect={(on) => {
                    const next = new Set(selected);
                    if (on) next.add(row.id); else next.delete(row.id);
                    setSelected(next);
                  }}
                  onOpen={() => setDetailId(row.id)}
                  pending={pending}
                  run={run}
                />
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={12 + passTypes.length} className="px-3 py-4 text-center text-tertiary">{t("noRequests")}</td></tr>
              )}
            </tbody>
            <tfoot className="bg-subtle font-medium">
              {/* totaluri pe selecția filtrată [C] */}
              <tr>
                <td className="px-2 py-1.5 text-tertiary" colSpan={2}>{t("selectedTotals")}</td>
                <td />
                <td className="px-2 py-1.5">{totalTickets}</td>
                {passTypes.map((pass) => (
                  <td key={pass.id} className="px-2 py-1.5">{totalPass(pass.id)}</td>
                ))}
                <td colSpan={7} />
              </tr>
              {/* allotments: NUM ALLOWED + ENFORCED + Remaining roșu [C] */}
              <tr className="text-[11px]">
                <td className="px-2 py-1.5 text-tertiary" colSpan={3}>
                  {t("numAllowed")} / {t("enforced")} / {t("remaining")}
                </td>
                <AllotmentCell
                  allowed={settings.tickets_allotment}
                  enforced={settings.tickets_enforced}
                  used={usedTickets}
                  canManage={canManage}
                  onChange={(allowed, enforced) =>
                    run(() =>
                      updateGlSettings(ctx.orgSlug, ctx.tourId, ctx.date, ctx.eventId, {
                        ticketsAllotment: allowed,
                        ticketsEnforced: enforced,
                      }),
                    )
                  }
                />
                {passTypes.map((pass) => {
                  const a = allotments.find((x) => x.pass_type_id === pass.id);
                  return (
                    <AllotmentCell
                      key={pass.id}
                      allowed={a?.num_allowed ?? null}
                      enforced={a?.enforced ?? false}
                      used={usedPass(pass.id)}
                      canManage={canManage}
                      onChange={(allowed, enforced) =>
                        run(() =>
                          upsertPassAllotment(ctx.orgSlug, ctx.tourId, ctx.date, ctx.eventId, pass.id, allowed, enforced),
                        )
                      }
                    />
                  );
                })}
                <td colSpan={7} />
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Panou detaliu cu APPROVE [C-S] */}
        {detail && (
          <aside className="w-64 shrink-0 space-y-2 rounded-[12px] border border-hairline bg-surface p-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold">{t("detail")}</span>
              <button onClick={() => setDetailId(null)} className="rounded px-1.5 hover:bg-subtle">✕</button>
            </div>
            <p className="text-sm font-medium">
              {detail.last_name}, {detail.first_name}
              {detail.priority && " ⭐"}
            </p>
            <p>{t("status")}: <b>{t(detail.status)}</b></p>
            <p>{t("tix")}: {detail.num_tickets}</p>
            {Object.entries(detail.passes).map(([passId, qty]) => (
              <p key={passId}>{passTypes.find((p) => p.id === passId)?.name}: {qty}</p>
            ))}
            <p>{t("phone")}: {detail.phone ?? "—"}</p>
            <p>{t("emailNotify")}: {detail.email_notify ?? "—"}</p>
            {canManage && (
              <div className="flex gap-1">
                {(["seatRow", "seat"] as const).map((field) => (
                  <input
                    key={field}
                    defaultValue={field === "seatRow" ? (detail.seat_row ?? "") : (detail.seat ?? "")}
                    placeholder={t(field)}
                    onBlur={(e) =>
                      run(() =>
                        upsertGuestRequest(ctx.orgSlug, ctx.tourId, ctx.date, ctx.eventId, {
                          ...rowToInput(detail),
                          [field]: e.target.value,
                        }),
                      )
                    }
                    className="w-16 rounded border border-hairline px-1.5 py-0.5"
                  />
                ))}
              </div>
            )}
            {detail.notes && <p className="whitespace-pre-wrap text-secondary">{detail.notes}</p>}
            {canManage && detail.status !== "approved" && (
              <button
                disabled={pending}
                onClick={() =>
                  run(() => setGuestStatus(ctx.orgSlug, ctx.tourId, ctx.date, ctx.eventId, [detail.id], "approved"))
                }
                className="w-full rounded bg-success px-3 py-1.5 font-bold text-white"
              >
                ✓ {t("approve")}
              </button>
            )}
            {canManage && detail.status !== "declined" && (
              <button
                disabled={pending}
                onClick={() =>
                  run(() => setGuestStatus(ctx.orgSlug, ctx.tourId, ctx.date, ctx.eventId, [detail.id], "declined"))
                }
                className="w-full rounded border border-danger px-3 py-1 text-danger"
              >
                {t("decline")}
              </button>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}

function SortableTh({
  label, k, sort, setSort,
}: {
  label: string;
  k: SortKey;
  sort: { key: SortKey; dir: 1 | -1 };
  setSort: (s: { key: SortKey; dir: 1 | -1 }) => void;
}) {
  return (
    <th className="px-2 py-1.5">
      <button
        onClick={() => setSort({ key: k, dir: sort.key === k ? ((-sort.dir) as 1 | -1) : 1 })}
        className="uppercase hover:underline"
      >
        {label} {sort.key === k ? (sort.dir === 1 ? "▲" : "▼") : ""}
      </button>
    </th>
  );
}

function rowToInput(row: GuestRow): GuestRequestInput {
  return {
    id: row.id,
    lastName: row.last_name,
    firstName: row.first_name ?? "",
    affiliation: row.affiliation ?? "",
    numTickets: row.num_tickets,
    pickup: row.pickup ?? "",
    priority: row.priority,
    notes: row.notes ?? "",
    emailNotify: row.email_notify ?? "",
    phone: row.phone ?? "",
    seatRow: row.seat_row ?? "",
    seat: row.seat ?? "",
    passes: row.passes,
  };
}

/**
 * Rândul "New Guest" permanent sus [C §6.9.3]:
 * - Enter/Tab-din-Notes finalizează guestul și mută focus pe Last Name
 * - smart defaults: affiliation/pickup/#tix rămân pt. următorul rând [C]
 * - în Notes, Enter face rând nou de text (comportament nativ textarea)
 */
function NewGuestRow({
  ctx, passTypes, pending, run,
}: {
  ctx: Ctx;
  passTypes: PassType[];
  pending: boolean;
  run: (fn: () => Promise<{ error?: string }>) => void;
}) {
  const t = useTranslations("gl");
  const lastNameRef = useRef<HTMLInputElement>(null);
  const empty: GuestRequestInput = {
    lastName: "", firstName: "", affiliation: "", numTickets: 0,
    pickup: "", priority: false, notes: "", emailNotify: "", phone: "",
    passes: {},
  };
  const [draft, setDraft] = useState<GuestRequestInput>(empty);

  function commit() {
    if (!draft.lastName.trim()) return;
    run(async () => {
      const r = await upsertGuestRequest(ctx.orgSlug, ctx.tourId, ctx.date, ctx.eventId, draft);
      if (!r.error) {
        // smart defaults [C]: păstrăm affiliation/pickup/#tix/passes
        setDraft({
          ...empty,
          affiliation: draft.affiliation,
          pickup: draft.pickup,
          numTickets: draft.numTickets,
          passes: draft.passes,
        });
        lastNameRef.current?.focus();
      }
      return r;
    });
  }

  function onEnter(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    }
  }

  const cell = "w-full min-w-12 rounded border border-hairline px-1.5 py-0.5";

  return (
    <tr className="bg-warning-subtle/50" title={t("newGuestHint")}>
      <td className="px-2 py-1">＋</td>
      <td className="px-2 py-1">
        <input ref={lastNameRef} value={draft.lastName} onChange={(e) => setDraft({ ...draft, lastName: e.target.value })} onKeyDown={onEnter} placeholder={t("last")} className={cell} />
      </td>
      <td className="px-2 py-1">
        <input value={draft.firstName} onChange={(e) => setDraft({ ...draft, firstName: e.target.value })} onKeyDown={onEnter} placeholder={t("first")} className={cell} />
      </td>
      <td className="px-2 py-1">
        <input type="number" min={0} value={draft.numTickets || ""} onChange={(e) => setDraft({ ...draft, numTickets: Number(e.target.value) || 0 })} onKeyDown={onEnter} className={`${cell} w-14`} />
      </td>
      {passTypes.map((pass) => (
        <td key={pass.id} className="px-2 py-1">
          <input
            type="number" min={0}
            value={draft.passes[pass.id] || ""}
            onChange={(e) =>
              setDraft({ ...draft, passes: { ...draft.passes, [pass.id]: Number(e.target.value) || 0 } })
            }
            onKeyDown={onEnter}
            className={`${cell} w-12`}
          />
        </td>
      ))}
      <td className="px-2 py-1 text-tertiary">{t("pending")}</td>
      <td className="px-2 py-1">
        <input value={draft.affiliation} onChange={(e) => setDraft({ ...draft, affiliation: e.target.value })} onKeyDown={onEnter} className={cell} />
      </td>
      <td className="px-2 py-1 text-tertiary">—</td>
      <td className="px-2 py-1 text-tertiary">—</td>
      <td className="px-2 py-1">
        <select value={draft.pickup} onChange={(e) => setDraft({ ...draft, pickup: e.target.value })} className={cell}>
          <option value="" />
          {PICKUPS.map((p) => (<option key={p} value={p}>{t(`pickup_${p}`)}</option>))}
        </select>
      </td>
      <td className="px-2 py-1">
        {/* Space comută [C] — comportament nativ de buton */}
        <button
          onClick={() => setDraft({ ...draft, priority: !draft.priority })}
          className={`rounded px-2 py-0.5 ${draft.priority ? "bg-warning-subtle border border-warning font-bold" : "border border-hairline"}`}
        >
          {draft.priority ? "Yes" : "No"}
        </button>
      </td>
      <td className="px-2 py-1">
        <textarea
          rows={1}
          value={draft.notes}
          onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
          onKeyDown={(e) => {
            // Tab din Notes pe rândul nou finalizează guestul [C]
            if (e.key === "Tab" && !e.shiftKey) {
              e.preventDefault();
              commit();
            }
          }}
          placeholder={t("notes")}
          className={cell}
          disabled={pending}
        />
      </td>
    </tr>
  );
}

function GuestRowView({
  ctx, row, passTypes, canManage, selected, onSelect, onOpen, pending, run,
}: {
  ctx: Ctx;
  row: GuestRow;
  passTypes: PassType[];
  canManage: boolean;
  selected: boolean;
  onSelect: (on: boolean) => void;
  onOpen: () => void;
  pending: boolean;
  run: (fn: () => Promise<{ error?: string }>) => void;
}) {
  const t = useTranslations("gl");

  function patch(input: Partial<GuestRequestInput>) {
    run(() =>
      upsertGuestRequest(ctx.orgSlug, ctx.tourId, ctx.date, ctx.eventId, {
        ...rowToInput(row),
        ...input,
      }),
    );
  }

  const cell = "w-full min-w-12 rounded border border-transparent bg-transparent px-1.5 py-0.5 hover:border-hairline focus:border-strong";
  const statusColor =
    row.status === "approved" ? "text-success" : row.status === "declined" ? "text-danger" : "text-secondary";

  return (
    <tr className={selected ? "bg-accent-subtle/50" : undefined}>
      <td className="px-2 py-1">
        <input type="checkbox" checked={selected} onChange={(e) => onSelect(e.target.checked)} />
      </td>
      <td className="px-2 py-1">
        <button onClick={onOpen} className="font-medium hover:underline">{row.last_name}</button>
      </td>
      <td className="px-2 py-1">
        <input defaultValue={row.first_name ?? ""} onBlur={(e) => e.target.value !== (row.first_name ?? "") && patch({ firstName: e.target.value })} className={cell} readOnly={!canManage} />
      </td>
      <td className="px-2 py-1">
        <input type="number" min={0} defaultValue={row.num_tickets} onBlur={(e) => Number(e.target.value) !== row.num_tickets && patch({ numTickets: Number(e.target.value) || 0 })} className={`${cell} w-14`} readOnly={!canManage} />
      </td>
      {passTypes.map((pass) => (
        <td key={pass.id} className="px-2 py-1">
          <input
            type="number" min={0}
            defaultValue={row.passes[pass.id] || ""}
            onBlur={(e) => {
              const qty = Number(e.target.value) || 0;
              if (qty !== (row.passes[pass.id] ?? 0))
                patch({ passes: { ...row.passes, [pass.id]: qty } });
            }}
            className={`${cell} w-12`}
            readOnly={!canManage}
          />
        </td>
      ))}
      <td className="px-2 py-1">
        {canManage ? (
          <select
            value={row.status}
            disabled={pending}
            onChange={(e) =>
              run(() =>
                setGuestStatus(ctx.orgSlug, ctx.tourId, ctx.date, ctx.eventId, [row.id], e.target.value as "pending" | "approved" | "declined"),
              )
            }
            className={`rounded border border-hairline px-1 py-0.5 font-medium ${statusColor}`}
          >
            {(["pending", "approved", "declined"] as const).map((s) => (
              <option key={s} value={s}>{t(s)}</option>
            ))}
          </select>
        ) : (
          <span className={`font-medium ${statusColor}`}>{t(row.status)}</span>
        )}
      </td>
      <td className="px-2 py-1">
        <input defaultValue={row.affiliation ?? ""} onBlur={(e) => e.target.value !== (row.affiliation ?? "") && patch({ affiliation: e.target.value })} className={cell} readOnly={!canManage} />
      </td>
      <td className="px-2 py-1 text-secondary">{row.requestor_name}</td>
      <td className="px-2 py-1 text-secondary">{row.requested_at.slice(0, 10)}</td>
      <td className="px-2 py-1">
        {canManage ? (
          <select value={row.pickup ?? ""} onChange={(e) => patch({ pickup: e.target.value })} className="rounded border border-hairline px-1 py-0.5">
            <option value="" />
            {PICKUPS.map((p) => (<option key={p} value={p}>{t(`pickup_${p}`)}</option>))}
          </select>
        ) : (
          <span>{row.pickup ? t(`pickup_${row.pickup}` as Parameters<typeof t>[0]) : "—"}</span>
        )}
      </td>
      <td className="px-2 py-1">
        <button
          disabled={!canManage || pending}
          onClick={() => patch({ priority: !row.priority })}
          className={`rounded px-2 py-0.5 ${row.priority ? "bg-warning-subtle border border-warning font-bold" : "border border-hairline text-tertiary"}`}
        >
          {row.priority ? "Yes" : "No"}
        </button>
      </td>
      <td className="max-w-40 truncate px-2 py-1 text-secondary" title={row.notes ?? ""}>
        {row.notes}
      </td>
    </tr>
  );
}

function AllotmentCell({
  allowed, enforced, used, canManage, onChange,
}: {
  allowed: number | null;
  enforced: boolean;
  used: number;
  canManage: boolean;
  onChange: (allowed: number | null, enforced: boolean) => void;
}) {
  const remaining = allowed != null ? allowed - used : null;
  return (
    <td className="px-2 py-1.5">
      <span className="flex items-center gap-1">
        <input
          type="number" min={0}
          defaultValue={allowed ?? ""}
          readOnly={!canManage}
          onBlur={(e) => {
            const v = e.target.value === "" ? null : Number(e.target.value);
            if (v !== allowed) onChange(v, enforced);
          }}
          className="w-14 rounded border border-hairline px-1 py-0.5"
        />
        <input
          type="checkbox"
          checked={enforced}
          disabled={!canManage || allowed == null}
          onChange={(e) => onChange(allowed, e.target.checked)}
          title="Enforced"
        />
        {remaining != null && (
          // Remaining ROȘU la negativ [C]
          <b className={remaining < 0 ? "text-danger" : "text-secondary"}>{remaining}</b>
        )}
      </span>
    </td>
  );
}

/** Form-ul simplu de crew [C §6.9.4] + lista requesturilor proprii. */
export function CrewGlForm({
  ctx,
  rows,
  passTypes,
  canSubmit,
}: {
  ctx: Ctx;
  rows: GuestRow[];
  passTypes: PassType[];
  canSubmit: boolean;
}) {
  const t = useTranslations("gl");
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState({
    lastName: "",
    firstName: "",
    affiliation: "",
    numTickets: 1,
    passId: "",
    notes: "",
  });

  function submit() {
    startTransition(async () => {
      const r = await upsertGuestRequest(ctx.orgSlug, ctx.tourId, ctx.date, ctx.eventId, {
        lastName: draft.lastName,
        firstName: draft.firstName,
        affiliation: draft.affiliation,
        numTickets: draft.numTickets,
        pickup: "",
        priority: false,
        notes: draft.notes,
        emailNotify: "",
        phone: "",
        passes: draft.passId ? { [draft.passId]: 1 } : {},
      });
      if (!r.error)
        setDraft({ lastName: "", firstName: "", affiliation: draft.affiliation, numTickets: 1, passId: draft.passId, notes: "" });
    });
  }

  const statusColor = (s: GuestRow["status"]) =>
    s === "approved" ? "text-success" : s === "declined" ? "text-danger" : "text-secondary";

  return (
    <div className="space-y-4">
      {canSubmit && (
        <div className="space-y-2 rounded-[12px] border border-hairline bg-surface p-3">
          <p className="text-sm font-medium">{t("submitRequest")}</p>
          <div className="flex flex-wrap gap-2">
            <input value={draft.lastName} onChange={(e) => setDraft({ ...draft, lastName: e.target.value })} placeholder={t("last")} className="w-32 rounded border border-hairline px-2 py-1 text-sm" />
            <input value={draft.firstName} onChange={(e) => setDraft({ ...draft, firstName: e.target.value })} placeholder={t("first")} className="w-32 rounded border border-hairline px-2 py-1 text-sm" />
            <input value={draft.affiliation} onChange={(e) => setDraft({ ...draft, affiliation: e.target.value })} placeholder={t("affiliation")} className="w-32 rounded border border-hairline px-2 py-1 text-sm" />
            <input type="number" min={0} value={draft.numTickets} onChange={(e) => setDraft({ ...draft, numTickets: Number(e.target.value) || 0 })} className="w-16 rounded border border-hairline px-2 py-1 text-sm" />
            {passTypes.length > 0 && (
              <select value={draft.passId} onChange={(e) => setDraft({ ...draft, passId: e.target.value })} className="rounded border border-hairline px-2 py-1 text-sm">
                <option value="">—</option>
                {passTypes.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
              </select>
            )}
            <input value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} placeholder={t("notes")} className="min-w-32 flex-1 rounded border border-hairline px-2 py-1 text-sm" />
            <button
              disabled={pending || !draft.lastName.trim()}
              onClick={submit}
              className="btn-quiet h-7 px-2.5 disabled:opacity-40"
            >
              {t("submitRequest")}
            </button>
          </div>
        </div>
      )}

      <div className="space-y-1">
        <p className="text-sm font-medium">{t("myRequests")}</p>
        {rows.length === 0 ? (
          <p className="text-sm text-tertiary">{t("noRequests")}</p>
        ) : (
          <ul className="divide-y divide-hairline rounded-[12px] border border-hairline bg-surface text-sm">
            {rows.map((row) => (
              <li key={row.id} className="flex items-center justify-between px-3 py-2">
                <span>
                  {row.last_name}, {row.first_name}
                  <span className="ml-2 text-xs text-secondary">
                    {row.num_tickets > 0 && `${row.num_tickets} tix`}
                    {Object.entries(row.passes).map(([passId, qty]) =>
                      ` · ${qty}× ${passTypes.find((p) => p.id === passId)?.name ?? ""}`,
                    )}
                  </span>
                </span>
                <b className={statusColor(row.status)}>{t(row.status)}</b>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
