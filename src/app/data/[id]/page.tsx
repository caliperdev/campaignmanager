import { redirect } from "next/navigation";

export default async function DataBoardRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/sources/${id}`);
}
