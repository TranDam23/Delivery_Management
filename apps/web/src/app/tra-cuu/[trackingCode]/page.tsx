import { TrackingDetailPage } from "@/components/orders/tracking";
import { BlockchainVerification } from "@/components/orders/blockchain-verification";

interface Props {
  params: Promise<{ trackingCode: string }>;
}

export default async function PublicTrackingDetailPage({ params }: Props): Promise<React.JSX.Element> {
  const { trackingCode } = await params;
  const isQrTrackingToken = trackingCode.startsWith("trk_");
  return (
    <main className="mx-auto min-h-screen max-w-[900px] space-y-6 px-5 py-10 text-dt-text">
      <TrackingDetailPage trackingCode={trackingCode} publicMode />
      {!isQrTrackingToken ? <BlockchainVerification trackingCode={trackingCode} /> : null}
    </main>
  );
}
