import { EditAddressPage } from "@/components/contacts/address-pages";

interface PageProps {
  params: Promise<{ id: string; addressId: string }>;
}

export default async function EditContactAddressPage({ params }: PageProps): Promise<React.JSX.Element> {
  const { id, addressId } = await params;
  return <EditAddressPage contactId={id} addressId={addressId} />;
}

