import { getStore } from "@netlify/blobs";

// All app data lives in Netlify Blobs:
//  - "sp-media": uploaded files, split into chunks  ({uploadId}/meta, {uploadId}/000000 ...)
//  - "sp-data":  posts, per-platform results and encrypted tokens
export function mediaStore() {
  return getStore({ name: "sp-media", consistency: "strong" });
}

export function dataStore() {
  return getStore({ name: "sp-data", consistency: "strong" });
}
