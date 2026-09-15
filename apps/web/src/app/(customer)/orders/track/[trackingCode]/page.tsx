import { TrackingDetailPage } from "@/components/orders/tracking";

interface TrackingPageProps {
  params: Promise<{ trackingCode: string }>;
}

export default async function CustomerTrackingDetailPage({ params }: TrackingPageProps): Promise<React.JSX.Element> {
  const { trackingCode } = await params;
  return <TrackingDetailPage trackingCode={trackingCode} />;
}

