import { NewAddressPage } from "@/components/contacts/address-pages";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function NewContactAddressPage({ params }: PageProps): Promise<React.JSX.Element> {
  const { id } = await params;
  return <NewAddressPage contactId={id} />;
}

