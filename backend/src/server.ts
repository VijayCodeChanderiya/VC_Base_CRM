import "dotenv/config";
import { createApp } from "@/app";

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
// 0.0.0.0 so hosting platforms (Render, etc.) can reach it from outside the
// container — 127.0.0.1 only accepts connections from inside the same machine.
const HOST = process.env.HOST ?? "0.0.0.0";

const app = createApp();
app.listen(PORT, HOST, () => {
  console.log(`Alphatech CRM backend listening on http://${HOST}:${PORT}`);
});
