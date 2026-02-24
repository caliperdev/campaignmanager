import { redirect } from "next/navigation";
import { enforceNotReadOnly } from "@/lib/read-only-guard";

export const metadata = {
  title: "Home",
  description: "Campaign Manager — Home",
};

export default async function HomePage() {
  await enforceNotReadOnly();
  redirect("/campaigns");
}
