import { OrderDetailPage } from "@/components/orders/order-detail";

interface OrderPageProps {
  params: Promise<{ id: string }>;
}

export default async function CustomerOrderDetailPage({ params }: OrderPageProps): Promise<React.JSX.Element> {
  const { id } = await params;
  return <OrderDetailPage orderId={id} />;
}

