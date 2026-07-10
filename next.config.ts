import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  env: {
    // ID de build (evaluat la build) — copt identic în bundle-ul de client
    // și în cel de server; /api/version îl servește pe cel al serverului,
    // clientul îl compară cu al lui → toast "versiune nouă" după deploy.
    NEXT_PUBLIC_BUILD_ID: new Date().toISOString(),
  },
};

export default withNextIntl(nextConfig);
