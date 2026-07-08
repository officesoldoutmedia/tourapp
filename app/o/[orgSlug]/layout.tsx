import Link from "next/link";
import { requireOrg } from "@/lib/org";
import { Contact, Bell, Settings } from "lucide-react";

export default async function OrgLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const { org, user, supabase, permission } = await requireOrg(orgSlug);

  const { count: unread } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("recipient_id", user.id)
    .is("read_at", null);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 flex h-14 items-center gap-4 border-b border-hairline bg-surface px-4 shadow-xs">
        <Link href="/app" className="font-display text-sm font-semibold tracking-tight text-secondary hover:text-primary">TourApp</Link>
        <Link href={`/o/${org.slug}`} className="text-sm font-semibold">
          {org.name}
        </Link>
        <span className="ml-auto flex items-center gap-3 text-sm">
          <Link href={`/o/${org.slug}/contacts`} title="Contacts" className="text-secondary transition-colors hover:text-primary"><Contact size={18} strokeWidth={1.5} /></Link>
          <Link href={`/o/${org.slug}/notifications`} title="Notifications" className="relative text-secondary transition-colors hover:text-primary">
            <Bell size={18} strokeWidth={1.5} />
            {(unread ?? 0) > 0 && (
              <span className="absolute -right-2 -top-1 rounded-full bg-danger px-1 text-[10px] font-bold text-white">
                {unread}
              </span>
            )}
          </Link>
          {["administrator", "accounting", "manager"].includes(permission) && (
            <Link href={`/o/${org.slug}/settings`} title="Settings" className="text-secondary transition-colors hover:text-primary"><Settings size={18} strokeWidth={1.5} /></Link>
          )}
        </span>
      </header>
      <div className="flex-1">{children}</div>
    </div>
  );
}
