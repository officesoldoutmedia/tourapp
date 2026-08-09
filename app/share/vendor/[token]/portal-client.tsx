"use client";

/** C4 — partea interactivă a portalului de vendor: formular „adaugă
 *  persoană" + listă cu ștergere (server actions) și upload de fișier
 *  (fetch direct pe route handler-ul multipart). Fără next-intl — toate
 *  stringurile vin din `t`, construit server-side din L10N-ul paginii. */
import { type FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addVendorEmployee, removeVendorEmployee } from "./actions";

export interface VendorEmployeeRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  role: string | null;
  phones: string[];
}

function mapActionError(error: string, t: Record<string, string>): string {
  if (error === "invalid_link") return t.invalidLink;
  if (error === "limit") return t.errorLimit;
  return t.errorGeneric;
}

function mapUploadError(code: string | undefined, t: Record<string, string>): string {
  if (code === "invalid_link") return t.invalidLink;
  if (code === "no_category") return t.uploadErrorNoCategory;
  if (code === "too_large") return t.uploadErrorTooLarge;
  if (code === "limit") return t.errorLimit;
  return t.errorGeneric;
}

export function PortalClient({
  token,
  canUpload,
  employees,
  t,
}: {
  token: string;
  canUpload: boolean;
  employees: VendorEmployeeRow[];
  t: Record<string, string>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [role, setRole] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  function submitPerson(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    startTransition(async () => {
      const res = await addVendorEmployee(token, {
        firstName,
        lastName: lastName || undefined,
        role: role || undefined,
        phone: phone || undefined,
        email: email || undefined,
      });
      if (res.error) {
        setFormError(mapActionError(res.error, t));
        return;
      }
      setFirstName("");
      setLastName("");
      setRole("");
      setPhone("");
      setEmail("");
    });
  }

  function removePerson(id: string) {
    if (!window.confirm(t.confirmRemove)) return;
    startTransition(async () => {
      const res = await removeVendorEmployee(token, id);
      if (res.error) setFormError(mapActionError(res.error, t));
    });
  }

  async function handleUpload(file: File) {
    setUploadError(null);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/vendor/${token}/upload`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setUploadError(mapUploadError(body.error, t));
        return;
      }
      router.refresh();
    } catch {
      setUploadError(t.errorGeneric);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div lang="en" className="contents">
      {/* continuarea secțiunii Fișiere: butonul de upload */}
      <div className="mt-3">
        <label
          className={`btn-quiet cursor-pointer ${!canUpload || uploading ? "pointer-events-none opacity-50" : ""}`}
        >
          {uploading ? "…" : t.uploadFile}
          <input
            type="file"
            className="hidden"
            disabled={!canUpload || uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleUpload(file);
              e.target.value = "";
            }}
          />
        </label>
        {uploadError && <p className="mt-2 text-[12px] text-danger">{uploadError}</p>}
      </div>

      {/* secțiunea Echipa: listă + formular add/delete */}
      <section className="mt-8 space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-tertiary">{t.team}</h2>
        {employees.length > 0 && (
          <ul className="divide-y divide-hairline rounded-[12px] border border-hairline bg-surface">
            {employees.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="flex-1 truncate">
                  {[p.first_name, p.last_name].filter(Boolean).join(" ")}
                  {p.role && <span className="text-secondary"> · {p.role}</span>}
                  {p.phones[0] && <span className="text-tertiary"> · {p.phones[0]}</span>}
                </span>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => removePerson(p.id)}
                  aria-label={t.remove}
                  title={t.remove}
                  className="shrink-0 text-secondary transition-colors hover:text-danger"
                >
                  🗑
                </button>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={submitPerson} className="flex flex-wrap items-end gap-2">
          <div>
            <label className="eyebrow mb-1 block">{t.firstName}*</label>
            <input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
              maxLength={80}
              className="h-[30px] w-36 rounded-[8px] border border-hairline bg-fill-control px-2.5 text-[12px] text-primary outline-none"
            />
          </div>
          <div>
            <label className="eyebrow mb-1 block">{t.lastName}</label>
            <input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              maxLength={80}
              className="h-[30px] w-36 rounded-[8px] border border-hairline bg-fill-control px-2.5 text-[12px] text-primary outline-none"
            />
          </div>
          <div>
            <label className="eyebrow mb-1 block">{t.role}</label>
            <input
              value={role}
              onChange={(e) => setRole(e.target.value)}
              maxLength={80}
              className="h-[30px] w-32 rounded-[8px] border border-hairline bg-fill-control px-2.5 text-[12px] text-primary outline-none"
            />
          </div>
          <div>
            <label className="eyebrow mb-1 block">{t.phone}</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              maxLength={40}
              className="h-[30px] w-36 rounded-[8px] border border-hairline bg-fill-control px-2.5 text-[12px] text-primary outline-none"
            />
          </div>
          <div>
            <label className="eyebrow mb-1 block">{t.email}</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={120}
              className="h-[30px] w-44 rounded-[8px] border border-hairline bg-fill-control px-2.5 text-[12px] text-primary outline-none"
            />
          </div>
          <button type="submit" disabled={pending || !firstName.trim()} className="btn-quiet">
            {t.addPerson}
          </button>
        </form>
        {formError && <p className="text-[12px] text-danger">{formError}</p>}
      </section>
    </div>
  );
}
