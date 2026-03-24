import { createApp } from "./app";
import { env } from "./config/env";

const app = createApp();

app.listen(env.PORT, () => {
  console.log(`PTA Pilot API listening on ${env.APP_BASE_URL}`);
});
