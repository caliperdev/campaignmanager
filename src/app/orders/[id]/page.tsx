import { notFound } from "next/navigation";
import {
  getOrder,
  getPlacementsForOrder,
  PLACEMENTS_TABLE_COLUMN_HEADERS,
  getTraffickerOptions,
  getAmOptions,
  getQaAmOptions,
  getFormatOptions,
  getCategoryOptions,
  getDealOptions,
} from "@/lib/tables";
import { TableView } from "@/components/TableView";
import { enforceNotReadOnly } from "@/lib/read-only-guard";

const INITIAL_PAGE_SIZE = 500;

export const metadata = {
  title: "Order",
  description: "Order placements",
};

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await enforceNotReadOnly();
  const { id: orderId } = await params;
  const [order, traffickerOptions, amOptions, qaAmOptions, formatOptions, categoryOptions, dealOptions] =
    await Promise.all([
      getOrder(orderId),
      getTraffickerOptions(),
      getAmOptions(),
      getQaAmOptions(),
      getFormatOptions(),
      getCategoryOptions(),
      getDealOptions(),
    ]);
  if (!order) notFound();

  const chunk = await getPlacementsForOrder(orderId, 0, INITIAL_PAGE_SIZE);

  const item = { ...order, columnHeaders: [...PLACEMENTS_TABLE_COLUMN_HEADERS] };

  return (
    <TableView
      key={chunk.total}
      item={item}
      basePath="/orders"
      initialDynamicRows={chunk.rows}
      dynamicTotal={chunk.total}
      readOnly={false}
      orderId={orderId}
      orderName={order.name}
      campaignId={order.campaignId}
      categoryOptions={categoryOptions}
      traffickerOptions={traffickerOptions}
      amOptions={amOptions}
      qaAmOptions={qaAmOptions}
      formatOptions={formatOptions}
      dealOptions={dealOptions}
    />
  );
}
