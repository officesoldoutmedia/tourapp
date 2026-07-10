/**
 * Antetul standard de ecran (Graphite): full-width cu hairline jos,
 * eyebrow 11.5px + titlu 26px, acțiuni aliniate jos-dreapta.
 */
export function PageHeader({
  eyebrow,
  title,
  actions,
}: {
  eyebrow?: React.ReactNode;
  title: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex items-end justify-between gap-6 border-b border-hairline px-8 pb-5 pt-[26px]">
      <div className="min-w-0">
        {eyebrow != null && (
          <p className="mb-1.5 truncate text-[11.5px] text-secondary">{eyebrow}</p>
        )}
        <h1 className="page-title">{title}</h1>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}
