import { listDocumentsWithEmbeddingStatus } from "@/lib/db";
import { DocumentTable } from "@/components/document-table";
import { UploadDialog } from "@/components/upload-dialog";

export const dynamic = "force-dynamic";

export default async function DocumentsPage() {
  // Fetch more documents to support pagination
  const documents = await listDocumentsWithEmbeddingStatus({ limit: 10000 });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Documents</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Browse and manage ingested documents
          </p>
        </div>
        <UploadDialog />
      </div>
      <DocumentTable documents={documents} />
    </div>
  );
}
