import type { Response } from "express";

/**
 * Minimal Server-Sent Events helpers.
 *
 * Hand-rolled rather than pulled from a library: the wire format is three lines, and the
 * service already avoids dependencies for things this small (conventions §8).
 */

/**
 * Opens an SSE response. `X-Accel-Buffering: no` matters in deployment — a buffering proxy
 * in front of Cloud Run will otherwise hold the whole stream and deliver it at once, which
 * looks exactly like streaming being broken.
 */
export const openSseStream = (res: Response): void => {
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
};

/**
 * Writes one named event. Data is JSON on a single line — an embedded newline would
 * terminate the event early and split it in two.
 */
export const writeSseEvent = (res: Response, event: string, data: unknown): void => {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
};
