import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { acceptInvitation } from "@/app/app/actions";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const t = await getTranslations("invite");
  const tp = await getTranslations("permissions");

  const supabase = await createServerSupabase();
  const [{ data: rows }, { data: userData }] = await Promise.all([
    supabase.rpc("get_invitation", { invite_token: token }),
    supabase.auth.getUser(),
  ]);
  const invitation = rows?.[0] as
    | {
        organization_name: string;
        email: string;
        permission: string;
        accepted: boolean;
      }
    | undefined;
  const user = userData.user;

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6 text-center">
        <h1 className="font-display text-2xl font-semibold tracking-tight">{t("title")}</h1>

        {!invitation || invitation.accepted ? (
          <p className="text-sm text-secondary">{t("invalid")}</p>
        ) : (
          <>
            <p className="text-sm">
              {t("body", {
                orgName: invitation.organization_name,
                permission: tp(invitation.permission),
              })}
            </p>

            {user ? (
              <form
                action={async () => {
                  "use server";
                  await acceptInvitation(token);
                }}
              >
                <button
                  type="submit"
                  className="btn-primary h-9"
                >
                  {t("accept")}
                </button>
              </form>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-secondary">
                  {t("needAccount", { email: invitation.email })}
                </p>
                <Link
                  href={`/login?next=${encodeURIComponent(`/invite/${token}`)}`}
                  className="btn-primary h-9inline-block "
                >
                  {t("accept")}
                </Link>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
