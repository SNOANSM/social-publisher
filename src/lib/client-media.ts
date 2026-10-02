// Browser-only helpers: read media dimensions, convert images to JPEG, chunked upload.
import { IG_MAX_IMAGE_SIZE } from "./limits";
import type { MediaKind } from "./types";

export interface PreparedMedia {
  file: File;
  kind: MediaKind;
  previewUrl: string;
  width?: number;
  height?: number;
  duration?: number;
  converted?: boolean;
}

const EXT_TYPES: Record<string, string> = {
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
};

export function mimeOf(file: File): string {
  if (file.type) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return EXT_TYPES[ext] ?? "";
}

function readVideoMeta(url: string): Promise<{ width?: number; height?: number; duration?: number }> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    const done = (v: { width?: number; height?: number; duration?: number }) => {
      clearTimeout(timer);
      video.removeAttribute("src");
      resolve(v);
    };
    const timer = setTimeout(() => done({}), 8000);
    video.preload = "metadata";
    video.muted = true;
    video.onloadedmetadata = () =>
      done({
        width: video.videoWidth || undefined,
        height: video.videoHeight || undefined,
        duration: Number.isFinite(video.duration) ? video.duration : undefined,
      });
    video.onerror = () => done({});
    video.src = url;
  });
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("تعذّر قراءة الصورة. جرّب صورة JPEG أو PNG."));
    img.src = url;
  });
}

// Instagram only accepts JPEG (max 8 MB), so other formats are converted in the browser.
async function toJpeg(img: HTMLImageElement, name: string): Promise<File> {
  const maxSide = 2160;
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  for (const quality of [0.92, 0.85, 0.75]) {
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", quality));
    if (blob && blob.size <= IG_MAX_IMAGE_SIZE) {
      return new File([blob], name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
    }
  }
  throw new Error("الصورة كبيرة جداً حتى بعد الضغط.");
}

export async function prepareMedia(file: File): Promise<PreparedMedia> {
  const type = mimeOf(file);
  if (type.startsWith("video/")) {
    const previewUrl = URL.createObjectURL(file);
    const meta = await readVideoMeta(previewUrl);
    const typed = file.type ? file : new File([file], file.name, { type });
    return { file: typed, kind: "video", previewUrl, ...meta };
  }
  if (type.startsWith("image/")) {
    const srcUrl = URL.createObjectURL(file);
    try {
      const img = await loadImage(srcUrl);
      if (type === "image/jpeg" && file.size <= IG_MAX_IMAGE_SIZE) {
        return { file, kind: "image", previewUrl: srcUrl, width: img.naturalWidth, height: img.naturalHeight };
      }
      const jpeg = await toJpeg(img, file.name);
      URL.revokeObjectURL(srcUrl);
      const converted = await loadImage(URL.createObjectURL(jpeg));
      return {
        file: jpeg,
        kind: "image",
        previewUrl: converted.src,
        width: converted.naturalWidth,
        height: converted.naturalHeight,
        converted: true,
      };
    } catch (err) {
      URL.revokeObjectURL(srcUrl);
      throw err;
    }
  }
  throw new Error("نوع الملف غير مدعوم. ارفع فيديو (MP4 / MOV) أو صورة.");
}

/* ---------------------------- chunked upload ---------------------------- */

export async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  if (res.status === 401) throw new Error("انتهت جلسة الدخول. حدّث الصفحة وسجّل الدخول من جديد.");
  if (!res.ok) throw Object.assign(new Error(body.error ?? `خطأ ${res.status}`), { body, status: res.status });
  return body as T;
}

function putChunk(url: string, blob: Blob, onProgress: (loaded: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.upload.onprogress = (e) => onProgress(e.loaded);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      let message = `خطأ ${xhr.status}`;
      try {
        message = JSON.parse(xhr.responseText).error ?? message;
      } catch {}
      reject(Object.assign(new Error(message), { status: xhr.status }));
    };
    xhr.onerror = () => reject(new Error("انقطع الاتصال أثناء رفع الملف."));
    xhr.send(blob);
  });
}

export async function uploadFile(file: File, onProgress: (fraction: number) => void): Promise<string> {
  const { uploadId, chunkSize, chunks } = await apiJson<{ uploadId: string; chunkSize: number; chunks: number }>("/api/uploads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileName: file.name, mimeType: file.type, size: file.size }),
  });

  const loaded = new Array<number>(chunks).fill(0);
  const report = () => onProgress(Math.min(1, loaded.reduce((a, b) => a + b, 0) / file.size));

  const sendChunk = async (index: number) => {
    const blob = file.slice(index * chunkSize, Math.min(file.size, (index + 1) * chunkSize));
    for (let attempt = 1; ; attempt++) {
      try {
        await putChunk(`/api/uploads/${uploadId}/chunks/${index}`, blob, (n) => {
          loaded[index] = n;
          report();
        });
        loaded[index] = blob.size;
        report();
        return;
      } catch (err) {
        const status = (err as { status?: number }).status;
        if (attempt >= 4 || status === 401 || status === 404) throw err;
        loaded[index] = 0;
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }
  };

  let next = 0;
  const worker = async () => {
    while (next < chunks) await sendChunk(next++);
  };
  await Promise.all(Array.from({ length: Math.min(3, chunks) }, worker));

  try {
    await apiJson(`/api/uploads/${uploadId}/complete`, { method: "POST" });
  } catch (err) {
    const missing = (err as { body?: { missing?: number[] } }).body?.missing;
    if (!missing?.length) throw err;
    for (const index of missing) await sendChunk(index);
    await apiJson(`/api/uploads/${uploadId}/complete`, { method: "POST" });
  }
  return uploadId;
}
