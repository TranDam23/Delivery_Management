import { ContactFormPage } from "@/components/contacts/contact-form";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditContactPage({ params }: PageProps): Promise<React.JSX.Element> {
  const { id } = await params;
  return <ContactFormPage contactId={id} />;
}

