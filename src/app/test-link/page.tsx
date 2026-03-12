import { getOrders } from "@/lib/tables";
import { TestPageContent } from "./TestPageContent";

export const metadata = {
  title: "Test Link",
  description: "Test placement × source join",
};

export default async function TestLinkPage() {
  const orders = await getOrders();
  return <TestPageContent orders={orders} />;
}
