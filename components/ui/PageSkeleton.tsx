/**
 * Skeleton de pagină (Graphite) — apare instant la navigare, cât se
 * încarcă datele. Antet + rânduri fantomă cu shimmer discret.
 */
export function PageSkeleton() {
  return (
    <div className="w-full animate-pulse pb-11" aria-busy>
      <div className="border-b border-hairline px-8 pb-5 pt-[26px]">
        <div className="h-3 w-40 rounded bg-fill-control" />
        <div className="mt-2.5 h-7 w-56 rounded bg-fill-control" />
      </div>
      <div className="max-w-[960px] space-y-0 px-8 pt-8">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex h-14 items-center gap-4 border-b border-faint">
            <div className="h-8 w-8 rounded-full bg-fill-control" />
            <div className="h-3 w-1/3 rounded bg-fill-control" />
            <div className="ml-auto h-3 w-24 rounded bg-fill-control" />
          </div>
        ))}
      </div>
    </div>
  );
}
