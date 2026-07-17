import { Firestore } from "@google-cloud/firestore";
import { config } from "./index";
import { createLogger } from "../utils/logger";

const log = createLogger("Firestore");

let instance: Firestore | undefined;

/**
 * Returns a memoized Firestore client. Construction is lazy and does not open a
 * connection, so importing this module (or booting the server) never requires
 * credentials — the client connects on first read/write.
 *
 * A single shared instance is used deliberately: the reference server created a new
 * client per repository (docs/migration/CONVENTIONS.md flags this), which wastes
 * connections. Repositories should call this instead of constructing their own.
 */
export const getFirestore = (): Firestore => {
  if (!instance) {
    const { projectId, databaseId } = config.firestore;
    instance = new Firestore({
      ...(projectId ? { projectId } : {}),
      databaseId,
    });
    log.info(
      `Initialized (database=${databaseId}, project=${projectId ?? "ADC-inferred"}).`,
    );
  }
  return instance;
};
