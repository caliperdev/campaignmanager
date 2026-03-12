import { redirect } from "next/navigation";

export default async function NewPlacementRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/orders/${id}/placements/new`);
}
