"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Input, Button } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import DistributionModuleModal, {
  parseDistributionModule,
} from "./DistributionModuleModal";
import { createCampaign } from "@/lib/campaign";
import { appendCampaignToTable } from "@/lib/table-actions";

const ORDER_DOCUMENTS_BUCKET = "order-documents";
const MAX_ORDER_FILE_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_ORDER_FILE_TYPES = [
  "application/zip",
  "application/x-zip-compressed",
  "application/pdf",
];

const ORDER_STEP_FIELDS = [
  { id: "advertiser", label: "Advertiser" },
  { id: "orderNumber", label: "Order #" },
  { id: "campaignId", label: "Campaign ID" },
  { id: "campaign", label: "Campaign" },
  { id: "agency", label: "Agency" },
  { id: "category", label: "Category" },
] as const;

const LINE_ITEM_FIELDS = [
  { id: "lineItemId", label: "Line Item ID" },
  { id: "lineItem", label: "Line Item" },
  { id: "format", label: "Format" },
  { id: "deal", label: "Deal" },
  { id: "startDate", label: "Start Date" },
  { id: "endDate", label: "End Date" },
  { id: "impressions", label: "Impressions" },
  { id: "cpm", label: "CPM" },
] as const;

const STEPS = [
  { id: "order", title: "Order" },
  { id: "lineItems", title: "Line Items" },
] as const;

type OrderFieldId = (typeof ORDER_STEP_FIELDS)[number]["id"];
type LineItemFieldId = (typeof LINE_ITEM_FIELDS)[number]["id"];

export type LineItemData = Record<LineItemFieldId, string> & { distributionModule: string };

function initialOrderData(): Record<OrderFieldId, string> {
  return {
    advertiser: "",
    orderNumber: "",
    campaignId: "",
    campaign: "",
    agency: "",
    category: "",
  };
}

function initialLineItem(): LineItemData {
  return {
    lineItemId: "",
    lineItem: "",
    format: "",
    deal: "",
    startDate: "",
    endDate: "",
    impressions: "",
    cpm: "",
    distributionModule: "",
  };
}

export default function NewCampaignContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [currentStep, setCurrentStep] = useState(0);
  const [orderData, setOrderData] = useState<Record<OrderFieldId, string>>(initialOrderData);
  const [lineItems, setLineItems] = useState<LineItemData[]>([initialLineItem()]);
  const [isDirty, setIsDirty] = useState(false);
  const [orderUploadPath, setOrderUploadPath] = useState<string | null>(null);
  const [orderUploadName, setOrderUploadName] = useState<string | null>(null);
  const [orderUploadError, setOrderUploadError] = useState<string | null>(null);
  const [orderUploading, setOrderUploading] = useState(false);
  const orderFileInputRef = useRef<HTMLInputElement>(null);
  const [distributionModalLineIndex, setDistributionModalLineIndex] = useState<number | null>(null);
  const [finishSaving, setFinishSaving] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);
  const [viewOrderFileOpen, setViewOrderFileOpen] = useState(false);
  const [viewOrderFileSignedUrl, setViewOrderFileSignedUrl] = useState<string | null>(null);
  const [viewOrderFileError, setViewOrderFileError] = useState<string | null>(null);
  const tableId = searchParams.get("tableId") ?? undefined;
  const returnTo = searchParams.get("returnTo") ?? undefined;

  const backHref = returnTo ?? (tableId ? `/campaigns/${tableId}` : "/campaigns");

  const goBack = useCallback(() => {
    if (isDirty && !window.confirm("You have unsaved changes. Discard changes?")) return;
    router.push(backHref);
  }, [isDirty, backHref, router]);

  const setOrderField = useCallback((id: OrderFieldId, value: string) => {
    setOrderData((prev) => ({ ...prev, [id]: value }));
    setIsDirty(true);
  }, []);

  const addLineItem = useCallback(() => {
    setLineItems((prev) => [...prev, initialLineItem()]);
    setIsDirty(true);
  }, []);

  const removeLineItem = useCallback((index: number) => {
    setLineItems((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((_, i) => i !== index);
    });
    setIsDirty(true);
  }, []);

  const setLineItemField = useCallback((index: number, id: LineItemFieldId, value: string) => {
    setLineItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [id]: value } : item))
    );
    setIsDirty(true);
  }, []);

  const handleOrderFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      setOrderUploadError(null);
      if (!file) return;

      if (file.size > MAX_ORDER_FILE_BYTES) {
        setOrderUploadError(`File must be 5MB or less (${(file.size / 1024 / 1024).toFixed(1)}MB selected).`);
        return;
      }
      if (!ALLOWED_ORDER_FILE_TYPES.includes(file.type)) {
        setOrderUploadError("File must be a ZIP or PDF.");
        return;
      }

      setOrderUploading(true);
      const supabase = createClient();
      const path = `${crypto.randomUUID()}/${file.name}`;

      const { error } = await supabase.storage
        .from(ORDER_DOCUMENTS_BUCKET)
        .upload(path, file, { upsert: false });

      setOrderUploading(false);
      if (error) {
        setOrderUploadError(error.message || "Upload failed.");
        return;
      }
      setOrderUploadPath(path);
      setOrderUploadName(file.name);
      setIsDirty(true);
    },
    []
  );

  const clearOrderUpload = useCallback(async () => {
    if (!orderUploadPath) return;
    const supabase = createClient();
    await supabase.storage.from(ORDER_DOCUMENTS_BUCKET).remove([orderUploadPath]);
    setOrderUploadPath(null);
    setOrderUploadName(null);
    setOrderUploadError(null);
    setIsDirty(true);
    orderFileInputRef.current?.focus();
  }, [orderUploadPath]);

  useEffect(() => {
    if (!viewOrderFileOpen || !orderUploadPath) {
      setViewOrderFileSignedUrl(null);
      setViewOrderFileError(null);
      return;
    }
    let cancelled = false;
    createClient()
      .storage.from(ORDER_DOCUMENTS_BUCKET)
      .createSignedUrl(orderUploadPath, 3600)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setViewOrderFileError(error.message || "Could not load file.");
          setViewOrderFileSignedUrl(null);
          return;
        }
        setViewOrderFileError(null);
        setViewOrderFileSignedUrl(data?.signedUrl ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [viewOrderFileOpen, orderUploadPath]);

  const handleFinish = useCallback(async () => {
    setFinishSaving(true);
    setFinishError(null);
    try {
      const first = lineItems[0];
      if (!first) {
        setFinishError("Add at least one line item.");
        setFinishSaving(false);
        return;
      }
      const startDate = first.startDate?.trim() || new Date().toISOString().slice(0, 10);
      const endDate = first.endDate?.trim() || startDate;
      if (startDate > endDate) {
        setFinishError("Start date must be before or equal to end date.");
        setFinishSaving(false);
        return;
      }
      const impressionsGoal = lineItems.reduce(
        (sum, li) => sum + (Number(li.impressions) || 0),
        0
      );
      const name =
        orderData.campaign?.trim() ||
        orderData.orderNumber?.trim() ||
        "Campaign";
      const dist = parseDistributionModule(first.distributionModule);
      const csvData: Record<string, string> = {
        "Insertion Order Name": name,
        "Start Date": startDate,
        "End Date": endDate,
        "Impressions Goal": String(impressionsGoal),
        Client: orderData.advertiser ?? "",
        "Internal Campaign": orderData.campaign ?? "",
        Agency: orderData.agency ?? "",
        Category: orderData.category ?? "",
        Format: first.format ?? "",
        Deal: first.deal ?? "",
        CPM: first.cpm ?? "",
        "Line Item ID": first.lineItemId ?? "",
        "Line Item": first.lineItem ?? "",
      };
      const result = await createCampaign(
        {
          name,
          startDate,
          endDate,
          impressionsGoal,
          distributionMode: dist.distributionMode,
          customRanges: dist.customRanges?.length ? dist.customRanges : null,
          csvData,
        },
        { returnToTableId: tableId }
      );
      if (!result?.newId) {
        setFinishError("Campaign was not created. Try again.");
        setFinishSaving(false);
        return;
      }
      if (tableId) {
        const appended = await appendCampaignToTable(tableId, result.newId);
        if (!appended) {
          setFinishError("Campaign was created but could not be added to this table. You can find it in Campaigns.");
          setFinishSaving(false);
          return;
        }
      }
      setIsDirty(false);
      router.push(tableId ? backHref : `/campaign/${result.newId}`);
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong. Try again.";
      setFinishError(message);
    } finally {
      setFinishSaving(false);
    }
  }, [backHref, tableId, router, orderData, lineItems]);

  const stepConfig = STEPS[currentStep];
  const stepTitle = stepConfig?.title ?? "Order";

  return (
    <main
      className="page-responsive-padding"
      style={{
        flex: 1,
        overflow: "auto",
        background: "var(--bg-primary)",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 1000 }}>
        <button
          type="button"
          onClick={goBack}
          style={{
            display: "inline-flex",
            alignItems: "center",
            fontSize: 13,
            fontWeight: 500,
            color: "var(--text-secondary)",
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 0,
            textAlign: "left",
            transition: "color 0.2s var(--anim-ease)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "var(--text-primary)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "var(--text-secondary)";
          }}
        >
          {tableId ? "\u2190 Back to table" : "\u2190 Back"}
        </button>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
          New Campaign
        </h1>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <h2
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "var(--text-secondary)",
              margin: 0,
            }}
          >
            {stepTitle}
          </h2>

          {currentStep === 0 && (
            <>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
                  gap: 16,
                }}
              >
                {ORDER_STEP_FIELDS.map(({ id, label }) => (
                  <Input
                    key={id}
                    id={id}
                    label={label}
                    value={orderData[id]}
                    onChange={(e) => setOrderField(id, e.target.value)}
                  />
                ))}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: "var(--text-secondary)",
                  }}
                >
                  Document (ZIP or PDF, max 5MB)
                </span>
                <input
                  ref={orderFileInputRef}
                  type="file"
                  accept=".zip,.pdf,application/zip,application/pdf"
                  onChange={handleOrderFileChange}
                  disabled={orderUploading}
                  style={{ fontSize: 14 }}
                />
                {orderUploadError && (
                  <span style={{ fontSize: 12, color: "#b22822" }}>
                    {orderUploadError}
                  </span>
                )}
                {orderUploading && (
                  <span style={{ fontSize: 13, color: "var(--text-tertiary)" }}>
                    Uploading…
                  </span>
                )}
                {orderUploadName && !orderUploading && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginTop: 4,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 13,
                        color: "var(--text-secondary)",
                      }}
                    >
                      Uploaded: {orderUploadName}
                    </span>
                    <Button
                      type="button"
                      variant="tertiary"
                      onClick={() => setViewOrderFileOpen(true)}
                      style={{ padding: "4px 8px", fontSize: 12 }}
                    >
                      View
                    </Button>
                    <Button
                      type="button"
                      variant="tertiary"
                      onClick={clearOrderUpload}
                      style={{ padding: "4px 8px", fontSize: 12 }}
                    >
                      Remove
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}

          {currentStep === 1 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {lineItems.map((item, index) => (
                <div
                  key={index}
                  style={{
                    padding: 16,
                    background: "var(--bg-secondary)",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--border-light)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 4,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: "var(--text-tertiary)",
                      }}
                    >
                      Line item {index + 1}
                    </span>
                    {lineItems.length > 1 && (
                      <Button
                        type="button"
                        variant="tertiary"
                        onClick={() => removeLineItem(index)}
                        style={{ padding: "4px 8px", fontSize: 12 }}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
                      gap: 12,
                    }}
                  >
                    {LINE_ITEM_FIELDS.map(({ id, label }) => (
                      <Input
                        key={id}
                        id={`line-item-${index}-${id}`}
                        label={label}
                        type={
                          id === "startDate" || id === "endDate"
                            ? "date"
                            : id === "impressions" || id === "cpm"
                              ? "number"
                              : "text"
                        }
                        min={id === "impressions" || id === "cpm" ? 0 : undefined}
                        value={item[id] ?? ""}
                        onChange={(e) => setLineItemField(index, id, e.target.value)}
                      />
                    ))}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 500,
                        color: "var(--text-secondary)",
                      }}
                    >
                      Distribution module
                    </span>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setDistributionModalLineIndex(index)}
                      style={{ alignSelf: "flex-start" }}
                    >
                      {(() => {
                        const parsed = parseDistributionModule(item.distributionModule);
                        const n = parsed.customRanges?.length ?? 0;
                        const darkCount = parsed.customRanges?.filter(
                          (r) => "isDark" in r && r.isDark
                        ).length ?? 0;
                        if (n === 0) return "Configure";
                        if (darkCount === n)
                          return `Configured (${n} dark week${n !== 1 ? "s" : ""})`;
                        return `Configured (${n} range${n !== 1 ? "s" : ""})`;
                      })()}
                    </Button>
                  </div>
                </div>
              ))}
              {distributionModalLineIndex !== null && (
                <DistributionModuleModal
                  open={true}
                  onClose={() => setDistributionModalLineIndex(null)}
                  lineItemLabel={`Line item ${distributionModalLineIndex + 1}`}
                  startDate={lineItems[distributionModalLineIndex]?.startDate ?? ""}
                  endDate={lineItems[distributionModalLineIndex]?.endDate ?? ""}
                  impressionsGoal={Number(lineItems[distributionModalLineIndex]?.impressions) || 0}
                  value={lineItems[distributionModalLineIndex]?.distributionModule ?? ""}
                  onSave={(value) => {
                    setLineItems((prev) =>
                      prev.map((item, i) =>
                        i === distributionModalLineIndex
                          ? { ...item, distributionModule: value }
                          : item
                      )
                    );
                    setIsDirty(true);
                    setDistributionModalLineIndex(null);
                  }}
                />
              )}
              <Button type="button" variant="secondary" onClick={addLineItem}>
                + Add line item
              </Button>
            </div>
          )}
        </div>

        <div
          style={{
            paddingTop: 12,
            display: "flex",
            gap: 12,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          {currentStep === 0 ? (
            <>
              <Button type="button" variant="primary" onClick={() => setCurrentStep(1)}>
                Next
              </Button>
              <Button type="button" variant="secondary" onClick={goBack}>
                Cancel
              </Button>
            </>
          ) : (
            <>
              {finishError && (
                <p style={{ margin: 0, fontSize: 13, color: "#b22822", width: "100%" }}>
                  {finishError}
                </p>
              )}
              <Button
                type="button"
                variant="primary"
                onClick={handleFinish}
                disabled={finishSaving}
              >
                {finishSaving ? "Saving…" : "Finish"}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setCurrentStep(0)}>
                Back
              </Button>
              <Button type="button" variant="secondary" onClick={goBack}>
                Cancel
              </Button>
            </>
          )}
        </div>
      </div>

      {viewOrderFileOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="view-order-file-title"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.45)",
            backdropFilter: "blur(4px)",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setViewOrderFileOpen(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setViewOrderFileOpen(false);
          }}
        >
          <div
            style={{
              background: "var(--bg-primary)",
              borderRadius: "var(--radius-lg)",
              boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
              width: "min(90vw, 800px)",
              maxHeight: "85vh",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 16px",
                borderBottom: "1px solid var(--border-light)",
              }}
            >
              <h3
                id="view-order-file-title"
                style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}
              >
                {orderUploadName ?? "Document"}
              </h3>
              <button
                type="button"
                onClick={() => setViewOrderFileOpen(false)}
                style={{
                  background: "transparent",
                  border: "none",
                  fontSize: 20,
                  cursor: "pointer",
                  color: "var(--text-tertiary)",
                  padding: "4px 8px",
                  borderRadius: 4,
                }}
              >
                ×
              </button>
            </div>
            <div style={{ flex: 1, overflow: "auto", padding: 16, minHeight: 200 }}>
              {viewOrderFileError && (
                <p style={{ margin: 0, fontSize: 14, color: "#b22822" }}>{viewOrderFileError}</p>
              )}
              {!viewOrderFileError && !viewOrderFileSignedUrl && (
                <p style={{ margin: 0, fontSize: 14, color: "var(--text-tertiary)" }}>Loading…</p>
              )}
              {!viewOrderFileError && viewOrderFileSignedUrl && (
                <>
                  {orderUploadName?.toLowerCase().endsWith(".pdf") ? (
                    <iframe
                      src={viewOrderFileSignedUrl}
                      title={orderUploadName ?? "PDF"}
                      style={{
                        width: "100%",
                        height: "70vh",
                        minHeight: 400,
                        border: "1px solid var(--border-light)",
                        borderRadius: "var(--radius-md)",
                      }}
                    />
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      <p style={{ margin: 0, fontSize: 14, color: "var(--text-secondary)" }}>
                        ZIP or archive — download to view contents.
                      </p>
                      <Button
                        type="button"
                        variant="primary"
                        onClick={() => window.open(viewOrderFileSignedUrl, "_blank", "noopener")}
                      >
                        Download {orderUploadName ?? "file"}
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
