import Link from "next/link";
import { redirect } from "next/navigation";
import { Bell } from "lucide-react";
import { requireOrg } from "@/lib/org";
import { createServerSupabase } from "@/lib/supabase/server";
import { AvatarMenu } from "@/components/ui/AvatarMenu";

/**
 * Shell-ul global — chrome 52px (Graphite README §1).
 * Breadcrumb: org › (tur — injectat de layoutul de tur în #chrome-crumb).
 */
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

  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, last_name, email")
    .eq("id", user.id)
    .maybeSingle();
  const displayName =
    [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") ||
    profile?.email ||
    "";
  const initials =
    [profile?.first_name?.[0], profile?.last_name?.[0]].filter(Boolean).join("").toUpperCase() ||
    (profile?.email?.[0] ?? "?").toUpperCase();

  async function signOut() {
    "use server";
    const sb = await createServerSupabase();
    await sb.auth.signOut();
    redirect("/login");
  }

  const canSettings = ["administrator", "accounting", "manager"].includes(permission);

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <header className="flex h-[52px] shrink-0 items-center gap-3 border-b border-hairline bg-chrome px-4">
        {/* logomark + wordmark */}
        <Link href="/app" className="flex shrink-0 items-center gap-2.5">
          <span className="flex h-6 w-6 items-center justify-center rounded-[7px] border border-strong bg-raised font-display text-[11px] font-semibold text-primary">
            T
          </span>
          <span className="font-display text-[13px] font-semibold tracking-[-0.01em] text-primary">
            TourApp
          </span>
        </Link>

        {/* breadcrumb */}
        <span className="flex min-w-0 items-center gap-1.5 border-l border-hairline pl-3">
          <Link
            href={`/o/${org.slug}`}
            className="truncate text-[12px] text-secondary transition-colors hover:text-primary"
          >
            {org.name}
          </Link>
          <span id="chrome-crumb" className="flex min-w-0 items-center" />
        </span>

        {/* cluster dreapta */}
        <span className="ml-auto flex shrink-0 items-center gap-2">
          <Link
            href={`/o/${org.slug}/notifications`}
            title="Notifications"
            className="relative flex h-[30px] w-[30px] items-center justify-center rounded-[8px] text-secondary transition-colors hover:bg-fill-control-hover hover:text-primary"
          >
            <Bell size={15} strokeWidth={1.5} />
            {(unread ?? 0) > 0 && (
              <span className="absolute right-0.5 top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-accent px-1 font-mono text-[9px] font-semibold text-white">
                {unread}
              </span>
            )}
          </Link>
          <span className="mx-1 h-4 w-px bg-hairline" aria-hidden />
          <AvatarMenu
            name={displayName}
            email={profile?.email ?? ""}
            initials={initials.slice(0, 2)}
            profileHref="/app"
            settingsHref={canSettings ? `/o/${org.slug}/settings` : null}
            signOut={signOut}
            labels={{
              profile: "My organizations",
              orgSettings: "Organization settings",
              signOut: "Sign out",
            }}
          />
        </span>
      </header>

      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
