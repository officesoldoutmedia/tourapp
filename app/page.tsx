import { redirect } from "next/navigation";

// Landing marketing = faza lansare; până atunci redirect /app (§8).
export default function Home() {
  redirect("/app");
}
