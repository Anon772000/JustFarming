import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { apiFetch } from "../../../api/http";
import { deleteEntity, listEntities, upsertEntities } from "../../../offline/indexedDb";
import type { ApiListResponse, ApiSingleResponse, Attachment, AttachmentEntityType } from "../../../types/api";

function isOfflineLikeError(err: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  if (err instanceof TypeError) return true;

  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return msg.includes("failed to fetch") || msg.includes("networkerror") || msg.includes("load failed");
  }

  return false;
}

async function getAttachments(args: { entityType: AttachmentEntityType; entityId: string }): Promise<Attachment[]> {
  const qs = new URLSearchParams({ entityType: args.entityType, entityId: args.entityId });

  try {
    const response = await apiFetch<ApiListResponse<Attachment>>(`/attachments?${qs.toString()}`);
    await upsertEntities("attachments", response.data as any);
    return response.data;
  } catch (err) {
    if (!isOfflineLikeError(err)) throw err;

    const cached = await listEntities<Attachment>("attachments");
    return cached
      .filter((a) => a.entityType === args.entityType && a.entityId === args.entityId)
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

async function uploadAttachment(args: {
  entityType: AttachmentEntityType;
  entityId: string;
  file: File;
  capturedAt?: string;
}): Promise<Attachment> {
  const form = new FormData();
  form.append("entityType", args.entityType);
  form.append("entityId", args.entityId);
  if (args.capturedAt) form.append("capturedAt", args.capturedAt);
  form.append("file", args.file, args.file.name);

  const response = await apiFetch<ApiSingleResponse<Attachment>>("/attachments/upload", {
    method: "POST",
    body: form as any,
  });

  await upsertEntities("attachments", [response.data as any]);
  return response.data;
}

async function removeAttachment(attachmentId: string): Promise<void> {
  await apiFetch<void>(`/attachments/${attachmentId}`, { method: "DELETE" });
  await deleteEntity("attachments", attachmentId as any);
}

export function AttachmentsPanel(props: {
  entityType: AttachmentEntityType;
  entityId: string;
  disabled?: boolean;
  showHeader?: boolean;
}) {
  const qc = useQueryClient();

  const attachmentsQuery = useQuery({
    queryKey: ["attachments", props.entityType, props.entityId],
    queryFn: () => getAttachments({ entityType: props.entityType, entityId: props.entityId }),
    staleTime: 30_000,
    enabled: !!props.entityId,
  });

  const [notice, setNotice] = useState<string | null>(null);

  const uploadMutation = useMutation({
    mutationFn: uploadAttachment,
    onSuccess: async () => {
      setNotice("Uploaded.");
      await qc.invalidateQueries({ queryKey: ["attachments", props.entityType, props.entityId] });
    },
    onError: (e) => setNotice((e as Error).message),
  });

  const deleteMutation = useMutation({
    mutationFn: removeAttachment,
    onSuccess: async () => {
      setNotice("Deleted.");
      await qc.invalidateQueries({ queryKey: ["attachments", props.entityType, props.entityId] });
    },
    onError: (e) => setNotice((e as Error).message),
  });

  const busy = !!props.disabled || uploadMutation.isPending || deleteMutation.isPending;

  const showHeader = props.showHeader !== false;

  const items = attachmentsQuery.data ?? [];

  const grid = useMemo(() => {
    return items.map((a) => {
      const mime = (a.mimeType || "").toLowerCase();
      const isImage = mime.startsWith("image/");
      const isVideo = mime.startsWith("video/");

      const preview = isImage ? (
        <img className="attachPreview" src={a.thumbnailUrl ?? a.url} alt={a.mediaType} loading="lazy" />
      ) : isVideo ? (
        <video className="attachPreview" src={a.url} preload="metadata" muted controls />
      ) : (
        <div className="attachPreview attachPreviewFile">{a.mediaType}</div>
      );

      return (
        <div key={a.id} className="attachCard">
          <a href={a.url} target="_blank" rel="noreferrer" title="Open">
            {preview}
          </a>
          <div className="attachMeta">
            <div className="mono" style={{ fontSize: 11 }}>{a.mimeType}</div>
            <div className="muted" style={{ marginTop: 4 }}>{new Date(a.createdAt).toLocaleString()}</div>
            <div className="actions" style={{ marginTop: 8 }}>
              <button
                className="btn"
                type="button"
                disabled={busy}
                onClick={() => {
                  if (!confirm("Delete attachment?") ) return;
                  void deleteMutation.mutateAsync(a.id);
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      );
    });
  }, [busy, deleteMutation, items]);

  return (
    <section style={{ marginTop: showHeader ? 10 : 0 }}>
      {showHeader ? (
        <header className="sectionHead">
          <div>
            <h3 style={{ marginBottom: 0 }}>Attachments</h3>
            <p className="muted" style={{ marginTop: 6 }}>Photos and videos for this item. Uploads require being online.</p>
          </div>
        </header>
      ) : null}

      {notice ? <div className="pill" style={{ marginTop: 8 }}>{notice}</div> : null}

      <div className="actions" style={{ marginTop: 10 }}>
        <label className="btn" style={{ display: "inline-flex", alignItems: "center" }}>
          Add files
          <input
            type="file"
            accept="image/*,video/*"
            multiple
            disabled={busy || (typeof navigator !== "undefined" && !navigator.onLine)}
            style={{ display: "none" }}
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.currentTarget.value = "";
              if (!files.length) return;
              setNotice(null);

              void (async () => {
                for (const file of files) {
                  await uploadMutation.mutateAsync({
                    entityType: props.entityType,
                    entityId: props.entityId,
                    file,
                    capturedAt: new Date().toISOString(),
                  });
                }
              })();
            }}
          />
        </label>

        <button className="btn" type="button" disabled={busy} onClick={() => void attachmentsQuery.refetch()}>
          Refresh
        </button>
      </div>

      {attachmentsQuery.isLoading ? <p className="muted" style={{ marginTop: 10 }}>Loading attachments...</p> : null}
      {attachmentsQuery.isError ? (
        <div className="alert" style={{ marginTop: 10 }}>Failed to load attachments: {(attachmentsQuery.error as Error).message}</div>
      ) : null}

      <div className="attachGrid" style={{ marginTop: 12 }}>
        {grid}
      </div>

      {!attachmentsQuery.isLoading && items.length === 0 ? <p className="muted" style={{ marginTop: 10 }}>No attachments yet.</p> : null}
    </section>
  );
}
