"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Upload, ArrowUpRight } from "lucide-react";
import { MAX_BYTES } from "@ledgerroot/contracts";
import { gateway, isSample } from "@/adapters/gateway";
import { Modal } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
type Item = { name: string; progress: number; status: string; id?: string; duplicate?: boolean };
export function UploadDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const cache = useQueryClient();
  const samples = useQuery({
    queryKey: ["sample-options"],
    queryFn: () => gateway.list(),
    enabled: open && isSample,
  });
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function upload(files: FileList | null) {
    if (!files) return;
    const selected = Array.from(files);
    if (
      selected.length > 5 ||
      selected.some((f) => f.size > MAX_BYTES || !["image/png", "image/jpeg"].includes(f.type))
    ) {
      setError("Choose up to five JPEG or PNG images, no larger than 10 MiB each.");
      return;
    }
    setError("");
    setBusy(true);
    setItems(selected.map((f) => ({ name: f.name, progress: 0, status: "Waiting" })));
    let cursor = 0;
    const update = (index: number, patch: Partial<Item>) =>
      setItems((old) => old.map((v, i) => (i === index ? { ...v, ...patch } : v)));
    async function next() {
      while (cursor < selected.length) {
        const i = cursor++;
        const file = selected[i]!;
        try {
          update(i, { status: "Uploading" });
          const result = await gateway.upload(file, (p) =>
            update(i, { progress: p, status: p === 100 ? "Saving original" : "Uploading" }),
          );
          update(i, {
            id: result.id,
            duplicate: result.duplicate,
            status: result.duplicate
              ? "Duplicate · existing record preserved"
              : "Saved · processing queued",
            progress: 100,
          });
        } catch (e) {
          update(i, { status: e instanceof Error ? e.message : "Upload failed" });
        }
      }
    }
    await Promise.all([next(), next()]);
    setBusy(false);
    await cache.invalidateQueries({ queryKey: ["documents"] });
  }
  return (
    <Modal
      open={open}
      onOpenChange={(value) => {
        if (!busy) onOpenChange(value);
      }}
      title={isSample ? "Choose a sample document" : "Upload documents"}
      description={
        isSample
          ? "Explore the review workflow with synthetic documents. No files leave your browser in sample mode."
          : "JPEG or PNG · up to 10 MiB and 24 megapixels each · five files per batch. PDFs and HEIC are not supported."
      }
    >
      {isSample ? (
        <div style={{ display: "grid", gap: 8 }}>
          {samples.data?.items.map((d) => (
            <Link
              className="btn"
              href={`/documents/${d.id}`}
              onClick={() => onOpenChange(false)}
              key={d.id}
            >
              {d.fields.vendor ?? d.filename}
              <ArrowUpRight size={16} />
            </Link>
          ))}
        </div>
      ) : (
        <>
          <div className="upload-area">
            <Upload size={28} />
            <label htmlFor="upload-files">Choose receipt or invoice images</label>
            <input
              id="upload-files"
              type="file"
              multiple
              accept="image/png,image/jpeg"
              disabled={busy}
              onChange={(e) => void upload(e.target.files)}
            />
          </div>
          {error && (
            <p role="alert" className="field-error">
              {error}
            </p>
          )}
          <div aria-live="polite">
            {items.map((item, i) => (
              <div className="upload-item" key={`${item.name}-${i}`}>
                <strong>{item.name}</strong>
                <p>{item.status}</p>
                {item.id && (
                  <Link
                    className="btn btn-ghost"
                    href={`/documents/${item.id}`}
                    onClick={() => onOpenChange(false)}
                  >
                    {item.duplicate ? "Open existing record" : "Review document"}
                    <ArrowUpRight size={16} />
                  </Link>
                )}
                <progress
                  aria-label={`${item.name} upload progress`}
                  value={item.progress}
                  max={100}
                />
              </div>
            ))}
          </div>
        </>
      )}
      <div className="dialog-actions">
        <Button disabled={busy} onClick={() => onOpenChange(false)}>
          Done
        </Button>
      </div>
    </Modal>
  );
}
