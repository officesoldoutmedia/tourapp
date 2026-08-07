"use client";

/** C3 — registrul juridic: listă+editor expandabil (pattern EXACT
 *  schedule-templates/templates-client.tsx și contract-templates
 *  /templates-client.tsx), plus secțiunea Contract-cadru per entitate
 *  (generare, status, valabilitate, upload semnat). Upload-ul semnatului
 *  urmează pattern-ul din extras-client.tsx (storage → server action). */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/browser";
import { findMatchingTemplate } from "@/lib/contractMerge";
import { saveCrewEntity, deleteCrewEntity, setFrameworkValidity, type CrewEntityInput } from "./actions";
import { generateContractDocument, setContractStatus, recordSignedContract, type TemplateRow } from "./contract-actions";

export interface FrameworkDocRow {
  id: string;
  docNumber: string;
  status: string;
  validUntil: string | null;
  createdAt: string;
}

export interface CrewEntityRow {
  id: string;
  entityType: string;
  displayName: string;
  companyName: string | null;
  cui: string | null;
  regCom: string | null;
  address: string | null;
  representative: string | null;
  iban: string | null;
  bank: string | null;
  vatPayer: boolean;
  fiscalCountry: string;
  idDocument: string | null;
  defaultRate: number | null;
  rateUnit: string;
  rateCurrency: string;
  paymentTermsDays: number | null;
  docLanguage: string;
  frameworkStatus: "active" | "expiring" | "missing";
  frameworkDocs: FrameworkDocRow[];
}

const inputCls = "rounded border border-hairline bg-surface px-2 py-1 text-sm";
const ENTITY_TYPES = ["srl", "pfa", "ii", "individual", "foreign"] as const;
const RATE_CURRENCIES = ["EUR", "RON", "USD", "GBP"] as const;

const STATUS_DOT: Record<CrewEntityRow["frameworkStatus"], string> = {
  active: "🟢",
  expiring: "🟡",
  missing: "🔴",
};
const STATUS_BADGE_CLS: Record<string, string> = {
  generated: "bg-inset text-tertiary",
  sent: "bg-warning-subtle text-warning",
  signed: "bg-success-subtle text-success",
  void: "bg-danger-subtle text-danger",
};

export function EntitiesClient({
  orgSlug,
  orgId,
  entities,
  templates,
}: {
  orgSlug: string;
  orgId: string;
  entities: CrewEntityRow[];
  templates: TemplateRow[];
}) {
  const t = useTranslations("crewRegistry");
  const tc = useTranslations("common");
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<{ error?: string }>) {
    startTransition(async () => {
      const result = await fn();
      if (!result?.error) {
        setOpenId(null);
        setCreating(false);
      }
    });
  }

  const statusLabel = {
    active: t("frameworkActive"),
    expiring: t("frameworkExpiring"),
    missing: t("frameworkMissing"),
  } as const;

  return (
    <div className="space-y-4">
      {entities.length === 0 && !creating && (
        <p className="text-sm text-secondary">{t("empty")}</p>
      )}

      <ul className="divide-y divide-hairline rounded-[12px] border border-hairline bg-surface empty:hidden">
        {entities.map((entity) => (
          <li key={entity.id} className="p-3">
            {openId === entity.id ? (
              <EntityForm
                orgSlug={orgSlug}
                orgId={orgId}
                initial={entity}
                templates={templates}
                pending={pending}
                onCancel={() => setOpenId(null)}
                onSave={(input) => run(() => saveCrewEntity(orgSlug, input))}
                onDelete={() => {
                  if (window.confirm(`${tc("delete")}?`)) {
                    run(() => deleteCrewEntity(orgSlug, entity.id));
                  }
                }}
              />
            ) : (
              <div className="flex items-center gap-3">
                <span className="min-w-0 flex-1">
                  <span className="text-sm font-medium">{entity.displayName}</span>
                  <span className="block text-xs text-secondary">
                    {entity.entityType}
                    {entity.cui && ` · ${entity.cui}`}
                    {" · "}
                    {STATUS_DOT[entity.frameworkStatus]} {statusLabel[entity.frameworkStatus]}
                  </span>
                </span>
                <button
                  title={tc("edit")}
                  onClick={() => {
                    setCreating(false);
                    setOpenId(entity.id);
                  }}
                  className="rounded px-1.5 py-0.5 text-xs hover:bg-subtle"
                >
                  ✎
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {creating ? (
        <div className="rounded-[12px] border border-hairline bg-surface p-3">
          <EntityForm
            orgSlug={orgSlug}
            orgId={orgId}
            initial={null}
            templates={templates}
            pending={pending}
            onCancel={() => setCreating(false)}
            onSave={(input) => run(() => saveCrewEntity(orgSlug, input))}
          />
        </div>
      ) : (
        <button
          onClick={() => {
            setOpenId(null);
            setCreating(true);
          }}
          className="btn-quiet h-7 px-2.5"
        >
          + {t("add")}
        </button>
      )}
    </div>
  );
}

function EntityForm({
  orgSlug,
  orgId,
  initial,
  templates,
  pending,
  onCancel,
  onSave,
  onDelete,
}: {
  orgSlug: string;
  orgId: string;
  initial: CrewEntityRow | null;
  templates: TemplateRow[];
  pending: boolean;
  onCancel: () => void;
  onSave: (input: CrewEntityInput) => void;
  onDelete?: () => void;
}) {
  const t = useTranslations("crewRegistry");
  const tc = useTranslations("common");
  const router = useRouter();

  const [entityType, setEntityType] = useState(initial?.entityType ?? "srl");
  const [displayName, setDisplayName] = useState(initial?.displayName ?? "");
  const [companyName, setCompanyName] = useState(initial?.companyName ?? "");
  const [cui, setCui] = useState(initial?.cui ?? "");
  const [regCom, setRegCom] = useState(initial?.regCom ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [representative, setRepresentative] = useState(initial?.representative ?? "");
  const [iban, setIban] = useState(initial?.iban ?? "");
  const [bank, setBank] = useState(initial?.bank ?? "");
  const [vatPayer, setVatPayer] = useState(initial?.vatPayer ?? false);
  const [fiscalCountry, setFiscalCountry] = useState(initial?.fiscalCountry ?? "RO");
  const [idDocument, setIdDocument] = useState(initial?.idDocument ?? "");
  const [defaultRate, setDefaultRate] = useState(
    initial?.defaultRate != null ? String(initial.defaultRate) : "",
  );
  const [rateUnit, setRateUnit] = useState(initial?.rateUnit ?? "per_show");
  const [rateCurrency, setRateCurrency] = useState(initial?.rateCurrency ?? "EUR");
  const [paymentTermsDays, setPaymentTermsDays] = useState(
    initial?.paymentTermsDays != null ? String(initial.paymentTermsDays) : "",
  );
  const [docLanguage, setDocLanguage] = useState(initial?.docLanguage ?? "ro");

  // ── Contract-cadru: generare + status + upload ──
  const frameworkTemplates = templates.filter((tpl) => tpl.doc_kind === "framework");
  const [templateId, setTemplateId] = useState(
    () =>
      (initial && findMatchingTemplate(frameworkTemplates, "framework", null, initial.entityType)?.id) ??
      frameworkTemplates[0]?.id ??
      "",
  );
  const [missing, setMissing] = useState<string[] | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [fwPending, startFw] = useTransition();

  function generate() {
    if (!initial || !templateId) return;
    setMissing(null);
    startFw(async () => {
      const result = await generateContractDocument(orgSlug, {
        kind: "framework",
        crewEntityId: initial.id,
        templateId,
      });
      if (result.missing) setMissing(result.missing);
      else if (result.error) setMissing([result.error]);
      else if (result.documentId) router.refresh();
    });
  }

  function markStatus(documentId: string, status: "sent" | "void") {
    startFw(async () => {
      await setContractStatus(orgSlug, documentId, status, `/o/${orgSlug}/crew`);
    });
  }

  function changeValidUntil(documentId: string, value: string) {
    startFw(async () => {
      await setFrameworkValidity(orgSlug, documentId, value || null);
    });
  }

  async function uploadSigned(documentId: string, file: File) {
    setUploadingId(documentId);
    setWarning(null);
    const supabase = createClient();
    // path: {orgId}/contracts/{uuid}-{nume} — pattern extras-client.tsx
    const path = `${orgId}/contracts/${crypto.randomUUID()}-${file.name}`;
    const { error: upError } = await supabase.storage.from("attachments").upload(path, file);
    if (upError) {
      setWarning(upError.message);
      setUploadingId(null);
      return;
    }
    startFw(async () => {
      const result = await recordSignedContract(
        orgSlug,
        documentId,
        { storagePath: path, fileName: file.name, mimeType: file.type, sizeBytes: file.size },
        `/o/${orgSlug}/crew`,
      );
      if (result.error) setWarning(result.error);
      else if (result.attachmentError) setWarning(result.attachmentError);
      setUploadingId(null);
    });
  }

  const statusText: Record<string, string> = {
    generated: t("statusGenerated"),
    sent: t("statusSent"),
    signed: t("statusSigned"),
    void: t("statusVoid"),
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-secondary">
            {t("entityType")}
          </span>
          <select
            value={entityType}
            onChange={(e) => setEntityType(e.target.value)}
            className={`${inputCls} w-full`}
          >
            {ENTITY_TYPES.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-secondary">
            {t("displayName")}
          </span>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className={`${inputCls} w-full`}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-secondary">
            {t("companyName")}
          </span>
          <input
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            className={`${inputCls} w-full`}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-secondary">
            {t("cui")}
          </span>
          <input
            value={cui}
            onChange={(e) => setCui(e.target.value)}
            className={`${inputCls} w-full font-mono`}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-secondary">
            {t("regCom")}
          </span>
          <input
            value={regCom}
            onChange={(e) => setRegCom(e.target.value)}
            className={`${inputCls} w-full`}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-secondary">
            {t("address")}
          </span>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className={`${inputCls} w-full`}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-secondary">
            {t("representative")}
          </span>
          <input
            value={representative}
            onChange={(e) => setRepresentative(e.target.value)}
            className={`${inputCls} w-full`}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-secondary">
            {t("iban")}
          </span>
          <input
            value={iban}
            onChange={(e) => setIban(e.target.value)}
            className={`${inputCls} w-full font-mono`}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-secondary">
            {t("bank")}
          </span>
          <input
            value={bank}
            onChange={(e) => setBank(e.target.value)}
            className={`${inputCls} w-full`}
          />
        </label>
        <label className="flex items-center gap-2 pt-5">
          <input
            type="checkbox"
            checked={vatPayer}
            onChange={(e) => setVatPayer(e.target.checked)}
            className="accent-[var(--accent)]"
          />
          <span className="text-xs font-semibold uppercase tracking-wide text-secondary">
            {t("vatPayer")}
          </span>
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-secondary">
            {t("fiscalCountry")}
          </span>
          <input
            value={fiscalCountry}
            onChange={(e) => setFiscalCountry(e.target.value)}
            className={`${inputCls} w-full font-mono`}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-secondary">
            {t("idDocument")}
          </span>
          <input
            value={idDocument}
            onChange={(e) => setIdDocument(e.target.value)}
            className={`${inputCls} w-full`}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-secondary">
            {t("defaultRate")}
          </span>
          <span className="flex gap-1.5">
            <input
              type="number"
              min={0}
              step="0.01"
              value={defaultRate}
              onChange={(e) => setDefaultRate(e.target.value)}
              className={`${inputCls} w-24 font-mono`}
            />
            <select
              aria-label="Currency"
              value={rateCurrency}
              onChange={(e) => setRateCurrency(e.target.value)}
              className={`${inputCls} font-mono`}
            >
              {RATE_CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </span>
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-secondary">
            {t("rateUnit")}
          </span>
          <select
            value={rateUnit}
            onChange={(e) => setRateUnit(e.target.value)}
            className={`${inputCls} w-full`}
          >
            <option value="per_show">{t("perShow")}</option>
            <option value="per_day">{t("perDay")}</option>
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-secondary">
            {t("paymentTerms")}
          </span>
          <input
            type="number"
            min={0}
            value={paymentTermsDays}
            onChange={(e) => setPaymentTermsDays(e.target.value)}
            className={`${inputCls} w-full font-mono`}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-secondary">
            {t("docLanguage")}
          </span>
          <select
            value={docLanguage}
            onChange={(e) => setDocLanguage(e.target.value)}
            className={`${inputCls} w-full`}
          >
            <option value="ro">RO</option>
            <option value="en">EN</option>
            <option value="bi">RO/EN</option>
          </select>
        </label>
      </div>

      {initial && (
        <div className="space-y-2 border-t border-hairline pt-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-secondary">
            {t("frameworkTitle")}
          </h3>

          {initial.frameworkDocs.length > 0 && (
            <ul className="space-y-2">
              {initial.frameworkDocs.map((doc) => (
                <li
                  key={doc.id}
                  className="flex flex-wrap items-center gap-2 rounded-md border border-hairline p-2 text-sm"
                >
                  <span className="font-mono text-xs font-semibold">{doc.docNumber}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_BADGE_CLS[doc.status] ?? "bg-inset text-tertiary"}`}
                  >
                    {statusText[doc.status] ?? doc.status}
                  </span>
                  <label className="flex items-center gap-1 text-xs text-secondary">
                    {t("validUntil")}
                    <input
                      type="date"
                      defaultValue={doc.validUntil ?? ""}
                      disabled={fwPending}
                      onChange={(e) => changeValidUntil(doc.id, e.target.value)}
                      className={inputCls}
                    />
                  </label>
                  <a
                    href={`/api/pdf/contract/${doc.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-md border border-hairline px-2 py-1 text-xs transition-colors hover:bg-subtle"
                  >
                    PDF
                  </a>
                  {doc.status === "generated" && (
                    <button
                      disabled={fwPending}
                      onClick={() => markStatus(doc.id, "sent")}
                      className="btn-quiet h-7 px-2"
                    >
                      {t("markSent")}
                    </button>
                  )}
                  {doc.status !== "void" && (
                    <button
                      disabled={fwPending}
                      onClick={() => markStatus(doc.id, "void")}
                      className="rounded px-2 py-1 text-xs text-danger hover:bg-danger-subtle"
                    >
                      {t("voidDoc")}
                    </button>
                  )}
                  <label className="cursor-pointer text-xs">
                    <span className="btn-quiet inline-flex h-7 items-center px-2">
                      {uploadingId === doc.id ? tc("loading") : t("uploadSigned")}
                    </span>
                    <input
                      type="file"
                      className="hidden"
                      disabled={uploadingId === doc.id}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) uploadSigned(doc.id, file);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </li>
              ))}
            </ul>
          )}

          {warning && <p className="text-xs text-warning">{warning}</p>}

          {frameworkTemplates.length === 0 ? (
            <p className="text-xs text-tertiary">{t("noTemplates")}</p>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                className={inputCls}
              >
                {frameworkTemplates.map((tpl) => (
                  <option key={tpl.id} value={tpl.id}>
                    {tpl.name}
                  </option>
                ))}
              </select>
              <button
                disabled={fwPending || !templateId}
                onClick={generate}
                className="btn-quiet h-7 px-2.5"
              >
                {t("generateFramework")}
              </button>
            </div>
          )}

          {missing && (
            <p className="text-xs text-danger">
              {t("missingFields")} {missing.join(", ")}
            </p>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 pt-2">
        <button
          disabled={pending || !displayName.trim()}
          onClick={() =>
            onSave({
              id: initial?.id,
              entityType,
              displayName,
              companyName,
              cui,
              regCom,
              address,
              representative,
              iban,
              bank,
              vatPayer,
              fiscalCountry,
              idDocument,
              defaultRate: defaultRate ? Number(defaultRate) : null,
              rateUnit,
              rateCurrency,
              paymentTermsDays: paymentTermsDays ? Number(paymentTermsDays) : null,
              docLanguage,
            })
          }
          className="btn-primary h-8 px-3 disabled:opacity-50"
        >
          {tc("save")}
        </button>
        <button onClick={onCancel} className="btn-quiet h-8 px-3">
          {tc("cancel")}
        </button>
        {onDelete && (
          <button
            disabled={pending}
            onClick={onDelete}
            className="ml-auto rounded px-2 py-1 text-xs text-danger hover:bg-danger-subtle"
          >
            {tc("delete")}
          </button>
        )}
      </div>
    </div>
  );
}
