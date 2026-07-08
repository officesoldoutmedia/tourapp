import Link from "next/link";
import { requireOrg } from "@/lib/org";

export default async function OrgLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const { org } = await requireOrg(orgSlug);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center gap-4 border-b border-neutral-200 px-4 py-2">
        <Link href="/app" className="text-sm text-neutral-500 hover:underline">
          ⌂
        </Link>
        <Link href={`/o/${org.slug}`} className="text-sm font-semibold">
          {org.name}
        </Link>
      </header>
      <div className="flex-1">{children}</div>
    </div>
  );
}
