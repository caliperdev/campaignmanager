import Link from "next/link";
import { getAdvertisers, getAgencies, getClients, getCategoryOptions } from "@/lib/tables";
import { enforceNotReadOnly } from "@/lib/read-only-guard";
import { NewCampaignForm } from "./NewCampaignForm";

export const metadata = {
  title: "New campaign",
  description: "Create a new campaign",
};

export default async function NewCampaignPage({
  searchParams,
}: {
  searchParams: Promise<{ advertiser?: string }>;
}) {
  await enforceNotReadOnly();
  const { advertiser: advertiserId } = await searchParams;
  const [advertisers, agencies, clients, categoryOptions] = await Promise.all([
    getAdvertisers(),
    getAgencies(),
    getClients(),
    getCategoryOptions(),
  ]);
  const defaultAdvertiserId = advertiserId && advertisers.some((a) => a.id === advertiserId) ? advertiserId : null;
  const agenciesFiltered = agencies.filter((a) => a.name !== "No agency");
  const clientsFiltered = clients.filter((c) => c.name !== "No client");

  return (
    <main
      className="page-responsive-padding"
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        background: "var(--bg-primary)",
        overflow: "auto",
      }}
    >
      <div
        style={{
          padding: "8px 32px",
          borderBottom: "1px solid var(--border-light)",
          background: "var(--bg-secondary)",
          fontSize: 13,
          color: "var(--text-tertiary)",
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <Link href="/campaigns" style={{ color: "var(--text-tertiary)", textDecoration: "none" }}>
          Campaigns
        </Link>
        <span style={{ margin: "0 4px" }}>/</span>
        <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>New campaign</span>
      </div>

      <div style={{ padding: 32, maxWidth: 640 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: "var(--text-primary)", margin: "0 0 24px" }}>
          New campaign
        </h1>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 24 }}>
          All fields are required: client, agency, advertiser, campaign ID, campaign name, and category.
        </p>
        <NewCampaignForm
          advertisers={advertisers}
          agencies={agenciesFiltered}
          clients={clientsFiltered}
          defaultAdvertiserId={defaultAdvertiserId}
          categoryOptions={categoryOptions}
        />
      </div>
    </main>
  );
}
