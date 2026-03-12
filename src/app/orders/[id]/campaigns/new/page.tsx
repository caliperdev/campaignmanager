import { redirect } from "next/navigation";
import { enforceNotReadOnly } from "@/lib/read-only-guard";

export default async function NewCampaignRedirect() {
  await enforceNotReadOnly();
  redirect(`/campaigns/new`);
}
