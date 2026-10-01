import { TrackingSearchPage } from "@/components/orders/tracking";

export default function PublicTrackingPage(): React.JSX.Element {
  return (
    <main className="mx-auto min-h-screen max-w-[900px] space-y-6 px-5 py-10 text-dt-text">
      <TrackingSearchPage publicMode />
    </main>
  );
}
