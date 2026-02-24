import { Suspense } from "react";
import NewCampaignContent from "./NewCampaignContent";
import { enforceNotReadOnly } from "@/lib/read-only-guard";

export const metadata = {
  title: "New Campaign",
  description: "Create a new campaign",
};

export default async function NewCampaignPage() {
  await enforceNotReadOnly();
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>Loading…</div>}>
      <NewCampaignContent />
    </Suspense>
  );
}
