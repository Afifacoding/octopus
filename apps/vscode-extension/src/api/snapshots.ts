import { createReadStream } from 'node:fs';
import { Buffer } from 'node:buffer';

import type { SnapshotCreateRequest, SnapshotRecord } from '../contracts/snapshot';

import { octopusRequestWithStream } from './client';

export async function createSnapshot(options: {
  projectId: string;
  cookie: string;
  timeoutMs: number;
  payload: SnapshotCreateRequest;
  archivePath: string;
  cancellationToken?: { isCancellationRequested: boolean };
  onUploadProgress?: (sentBytes: number, totalBytes: number) => void;
}) {
  const jsonTemplate = JSON.stringify({
    ...options.payload,
    archive: {
      ...options.payload.archive,
      base64Data: '',
    },
  });
  const marker = '"base64Data":""';
  const markerIndex = jsonTemplate.indexOf(marker);
  if (markerIndex < 0) {
    throw new Error('Snapshot request is missing its archive data field');
  }

  const prefixEnd = markerIndex + '"base64Data":"'.length;
  const prefix = jsonTemplate.slice(0, prefixEnd);
  const suffix = jsonTemplate.slice(prefixEnd);
  const base64Size = 4 * Math.ceil(options.payload.archive.sizeBytes / 3);
  const contentLength = Buffer.byteLength(prefix) + base64Size + Buffer.byteLength(suffix);

  const body = (async function* () {
    yield Buffer.from(prefix);

    const archiveStream = createReadStream(options.archivePath, { highWaterMark: 64 * 1024 });
    let remaining = Buffer.alloc(0);
    let fileBytesRead = 0;

    for await (const chunk of archiveStream) {
      const current = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      fileBytesRead += current.byteLength;
      const combined = remaining.byteLength > 0 ? Buffer.concat([remaining, current]) : current;
      const completeLength = combined.byteLength - (combined.byteLength % 3);

      if (completeLength > 0) {
        yield Buffer.from(combined.subarray(0, completeLength).toString('base64'));
      }

      remaining = Buffer.from(combined.subarray(completeLength));
    }

    if (fileBytesRead !== options.payload.archive.sizeBytes) {
      throw new Error('Snapshot archive changed while it was being uploaded');
    }

    if (remaining.byteLength > 0) {
      yield Buffer.from(remaining.toString('base64'));
    }

    yield Buffer.from(suffix);
  })();

  return octopusRequestWithStream<{ snapshot: SnapshotRecord }>(`/projects/${options.projectId}/snapshots`, {
    method: 'POST',
    cookie: options.cookie,
    timeoutMs: options.timeoutMs,
    body,
    contentLength,
    ...(options.cancellationToken ? { cancellationToken: options.cancellationToken } : {}),
    ...(options.onUploadProgress ? { onUploadProgress: options.onUploadProgress } : {}),
  });
}
