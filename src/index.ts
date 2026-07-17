import app from "./app";
import { config } from "./config";
import { createLogger } from "./utils/logger";

const log = createLogger("Server");

app.listen(config.port, () => {
  log.info(`Listening on http://localhost:${config.port} (${config.nodeEnv})`);
});
