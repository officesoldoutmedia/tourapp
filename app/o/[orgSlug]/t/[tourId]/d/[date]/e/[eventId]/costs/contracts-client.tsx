"use client";

/** C3 §13.6 — cardul „Contracte" de pe Costs & profit: lista anexelor
 *  acestui event (status, PDF, upload semnat — pattern identic cu
 *  entities-client.tsx) + rândul de crew fără anexă vie, cu butonul
 *  manual „Generează anexa" (lista lipsurilor inline, ca la T7). */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { createClient } from "@/lib/supabase/browser";
import { findMatchingTemplate } from "@/lib/contractMerge";
import {
  generateContractDocument,
  setContractStatus,
  recordSignedContract,
  type TemplateRow,
} from "@/app/o/[orgSlug]/crew/contract-actions";

export interface AnnexRow {
  id: string;
  docNumber: string;
  status: string;
  entityName: string;
}

export interface CrewAnnexRow {
  personnelId: string;
  personnelName: string;
  role: string | null;
  crewEntityId: string | null;
  entityType: string | null;
  hasAnnex: boolean;
}

const STATUS_BADGE_CLS: Record<string, string> = {
  generated: "bg-inset text-tertiary",
  sent: "bg-warning-subtle text-warning",
  signed: "bg-success-subtle text-success",
  void: "bg-danger-subtle text-danger",
};

export function ContractsClient({
  orgSlug,
  orgId,
  tourId,
  path,
  eventId,
  canAccounting,
  annexes,
  crewRows,
  templates,
}: {
  orgSlug: string;
  orgId: string;
  tourId: string;
  path: string;
  eventId: string;
  canAccounting: boolean;
  annexes: AnnexRow[];
  crewRows: CrewAnnexRow[];
  templates: TemplateRow[];
}) {
  const t = useTranslations("showCosts");
  const tCrew = useTranslations("crewRegistry");
  const tc = useTranslations("common");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [rowState, setRowState] = useState<
    Record<string, { missing?: string[]; noTemplate?: boolean }>
  >({});

  const statusText: Record<string, string> = {
    generated: tCrew("statusGenerated"),
    sent: tCrew("statusSent"),
    signed: tCrew("statusSigned"),
    void: tCrew("statusVoid"),
  };

  function markStatus(documentId: string, status: "sent" | "void") {
    startTransition(async () => {
      await setContractStatus(orgSlug, documentId, status, path);
    });
  }

  async function uploadSigned(documentId: string, file: File) {
    setUploadingId(documentId);
    setWarning(null);
    const supabase = createClient();
    // path: {orgId}/contracts/{uuid}-{nume} — pattern extras-client.tsx / entities-client.tsx
    const storagePath = `${orgId}/contracts/${crypto.randomUUID()}-${file.name}`;
    const { error: upError } = await supabase.storage.from("attachments").upload(storagePath, file);
    if (upError) {
      setWarning(upError.message);
      setUploadingId(null);
      return;
    }
    startTransition(async () => {
      const result = await recordSignedContract(
        orgSlug,
        documentId,
        { storagePath, fileName: file.name, mimeType: file.type, sizeBytes: file.size },
        path,
      );
      if (result.error) setWarning(result.error);
      else if (result.attachmentError) setWarning(result.attachmentError);
      setUploadingId(null);
    });
  }

  function generateAnnex(row: CrewAnnexRow) {
    const crewEntityId = row.crewEntityId;
    if (!crewEntityId) return;
    const template = findMatchingTemplate(templates, "annex", row.role, row.entityType ?? "");
    if (!template) {
      setRowState((s) => ({ ...s, [row.personnelId]: { noTemplate: true } }));
      return;
    }
    setRowState((s) => ({ ...s, [row.personnelId]: {} }));
    startTransition(async () => {
      const result = await generateContractDocument(orgSlug, {
        kind: "annex",
        crewEntityId,
        templateId: template.id,
        eventId,
        personnelId: row.personnelId,
      });
      if (result.missing) {
        setRowState((s) => ({ ...s, [row.personnelId]: { missing: result.missing } }));
      } else if (result.error) {
        setRowState((s) => ({ ...s, [row.personnelId]: { missing: [result.error!] } }));
      } else if (result.documentId) {
        router.refresh();
      }
    });
  }

  const pendingRows = crewRows.filter((row) => !row.hasAnnex);

  return (
    <section className="rounded-[12px] border border-hairline bg-surface p-4">
      <h2 className="mb-3 font-display text-lg font-semibold tracking-tight">
        {t("contractsTitle")}
      </h2>

      {annexes.length === 0 ? (
        <p className="text-sm text-tertiary">{t("contractNone")}</p>
      ) : (
        <ul className="space-y-2">
          {annexes.map((doc) => (
            <li
              key={doc.id}
              className="flex flex-wrap items-center gap-2 rounded-md border border-hairline p-2 text-sm"
            >
              <span className="font-mono text-xs font-semibold">{doc.docNumber}</span>
              <span className="min-w-0 flex-1 truncate">{doc.entityName}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_BADGE_CLS[doc.status] ?? "bg-inset text-tertiary"}`}
              >
                {statusText[doc.status] ?? doc.status}
              </span>
              <a
                href={`/api/pdf/contract/${doc.id}`}
                target="_blank"
                rel="noreferrer"
                className="rounded-md border border-hairline px-2 py-1 text-xs transition-colors hover:bg-subtle"
              >
                PDF
              </a>
              {canAccounting && doc.status === "generated" && (
                <button
                  disabled={pending}
                  onClick={() => markStatus(doc.id, "sent")}
                  className="btn-quiet h-7 px-2"
                >
                  {tCrew("markSent")}
                </button>
              )}
              {canAccounting && doc.status !== "signed" && (
                <button
                  disabled={pending}
                  onClick={() => {
                    if (window.confirm(`${tCrew("voidDoc")}?`)) markStatus(doc.id, "void");
                  }}
                  className="rounded px-2 py-1 text-xs text-danger hover:bg-danger-subtle"
                >
                  {tCrew("voidDoc")}
                </button>
              )}
              {canAccounting && (
                <label className="cursor-pointer text-xs">
                  <span className="btn-quiet inline-flex h-7 items-center px-2">
                    {uploadingId === doc.id ? tc("loading") : tCrew("uploadSigned")}
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
              )}
            </li>
          ))}
        </ul>
      )}

      {warning && <p className="mt-2 text-xs text-warning">{warning}</p>}

      {canAccounting && pendingRows.length > 0 && (
        <ul className="mt-4 space-y-1.5 border-t border-hairline pt-3">
          {pendingRows.map((row) => (
            <li key={row.personnelId}>
              {row.crewEntityId ? (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1">{row.personnelName}</span>
                  <button
                    disabled={pending}
                    onClick={() => generateAnnex(row)}
                    className="btn-quiet h-7 px-2.5 text-xs"
                  >
                    {t("contractGenerate")}
                  </button>
                  {rowState[row.personnelId]?.noTemplate && (
                    <span className="text-xs text-tertiary">{t("contractNoTemplate")}</span>
                  )}
                  {rowState[row.personnelId]?.missing && (
                    <p className="w-full text-xs font-medium text-danger">
                      {t("contractMissing")} {rowState[row.personnelId]!.missing!.join(", ")}
                    </p>
                  )}
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2 rounded-md bg-inset px-2 py-1.5 text-xs text-tertiary">
                  <span className="min-w-0 flex-1">{row.personnelName}</span>
                  <span>{t("contractNoEntity")}</span>
                  <Link
                    href={`/o/${orgSlug}/t/${tourId}/personnel/${row.personnelId}`}
                    className="text-accent hover:underline"
                  >
                    →
                  </Link>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
