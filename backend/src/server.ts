import "dotenv/config";
import { createApp } from "@/app";

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;

const app = createApp();
app.listen(PORT, "127.0.0.1", () => {
  console.log(`Alphatech CRM backend listening on http://127.0.0.1:${PORT}`);
});
