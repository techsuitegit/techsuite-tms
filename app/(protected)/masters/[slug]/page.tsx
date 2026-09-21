import { notFound } from "next/navigation";

import { masterLabelForSlug } from "@/app/config/menu-permissions";
import { MasterRecordPage } from "@/app/ui/modules/masters/master-record-page";

export default async function MasterSlugPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const title = masterLabelForSlug(slug);
  if (!title) notFound();
  return <MasterRecordPage title={title} />;
}
