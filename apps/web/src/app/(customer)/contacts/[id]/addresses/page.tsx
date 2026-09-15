import { AddressListPage } from "@/components/contacts/address-pages";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ContactAddressesPage({ params }: PageProps): Promise<React.JSX.Element> {
  const { id } = await params;
  return <AddressListPage contactId={id} />;
}

