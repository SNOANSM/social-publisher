import { mediaStore } from "./stores";
import { CHUNK_SIZE } from "./limits";
import type { UploadMeta } from "./types";

const chunkKey = (id: string, index: number) => `${id}/${String(index).padStart(6, "0")}`;
const metaKey = (id: string) => `${id}/meta`;

export function isValidUploadId(id: string): boolean {
  return /^[A-Za-z0-9_-]{10,64}$/.test(id);
}

export async function createUpload(meta: Omit<UploadMeta, "chunkSize" | "chunks" | "createdAt" | "complete">): Promise<UploadMeta> {
  const full: UploadMeta = {
    ...meta,
    chunkSize: CHUNK_SIZE,
    chunks: Math.max(1, Math.ceil(meta.size / CHUNK_SIZE)),
    createdAt: new Date().toISOString(),
    complete: false,
  };
  await mediaStore().setJSON(metaKey(meta.id), full);
  return full;
}

export async function getUpload(id: string): Promise<UploadMeta | null> {
  if (!isValidUploadId(id)) return null;
  return (await mediaStore().get(metaKey(id), { type: "json" })) as UploadMeta | null;
}

export function expectedChunkSize(meta: UploadMeta, index: number): number {
  return index === meta.chunks - 1 ? meta.size - meta.chunkSize * (meta.chunks - 1) : meta.chunkSize;
}

export async function putChunk(meta: UploadMeta, index: number, data: ArrayBuffer): Promise<void> {
  await mediaStore().set(chunkKey(meta.id, index), data);
}

export async function missingChunks(meta: UploadMeta): Promise<number[]> {
  const { blobs } = await mediaStore().list({ prefix: `${meta.id}/` });
  const present = new Set(blobs.map((b) => b.key));
  const missing: number[] = [];
  for (let i = 0; i < meta.chunks; i++) if (!present.has(chunkKey(meta.id, i))) missing.push(i);
  return missing;
}

export async function markComplete(meta: UploadMeta): Promise<void> {
  await mediaStore().setJSON(metaKey(meta.id), { ...meta, complete: true });
}

export async function readChunk(meta: UploadMeta, index: number): Promise<Uint8Array> {
  const buf = (await mediaStore().get(chunkKey(meta.id, index), { type: "arrayBuffer" })) as ArrayBuffer | null;
  if (!buf) throw new Error(`الجزء ${index} من الملف مفقود`);
  return new Uint8Array(buf);
}

// Streams the file chunk by chunk, prefetching the next chunk while the current one is consumed.
export async function* iterateFile(meta: UploadMeta): AsyncGenerator<Uint8Array> {
  let next: Promise<Uint8Array> | null = readChunk(meta, 0);
  for (let i = 0; i < meta.chunks; i++) {
    const current: Uint8Array = await next!;
    next = i + 1 < meta.chunks ? readChunk(meta, i + 1) : null;
    yield current;
  }
}

export function fileStream(meta: UploadMeta): ReadableStream<Uint8Array> {
  const it = iterateFile(meta);
  return new ReadableStream({
    async pull(controller) {
      const { value, done } = await it.next();
      if (done) controller.close();
      else controller.enqueue(value);
    },
    async cancel() {
      await it.return(undefined);
    },
  });
}

export async function deleteUpload(id: string): Promise<void> {
  const store = mediaStore();
  const { blobs } = await store.list({ prefix: `${id}/` });
  for (let i = 0; i < blobs.length; i += 10) {
    await Promise.all(blobs.slice(i, i + 10).map((b) => store.delete(b.key)));
  }
}

export async function listUploadIds(): Promise<string[]> {
  const { directories } = await mediaStore().list({ directories: true });
  return directories;
}
