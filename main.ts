import fs from "fs/promises";
import puppeteer from "puppeteer";
import { createSession } from "x-client-transaction-id-extract-browser";

interface Dict {
  animationKey: string;
  verification: string;
}

const proxies = (process.env.PROXY_LIST ?? "")
  .split("\n")
  .map((line) => line.trim())
  .filter(Boolean)
  .map((line) => {
    const [host, port, username, password] = line.split(":");
    return { host, port, username, password };
  });
const proxy = proxies.length > 0 ? proxies[Math.floor(Math.random() * proxies.length)] : undefined;

const dict: Dict[] = [];
const max = 30;
const browser = await puppeteer.launch({
  headless: true,
  protocolTimeout: 60000,
  args: [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-accelerated-2d-canvas",
    "--disable-gpu",
    ...(proxy ? [`--proxy-server=http://${proxy.host}:${proxy.port}`] : []),
  ],
});

for (let i = 0; i < max; i++) {
  console.log(`${i} / ${max}`);
  const page = await browser.newPage();
  try {
    if (proxy) {
      await page.authenticate({ username: proxy.username, password: proxy.password });
    }
    const session = await createSession(browser, page);
    const keyConverter = await session.initKeyConverter();
    const animationKey = await keyConverter();
    dict.push({
      animationKey: animationKey.split("obfiowerehiring")[1],
      verification: session.verification,
    });
  } catch (e) {
    console.error(e);
  } finally {
    await page.close().catch(() => {});
  }
}

await fs.writeFile("pair.json", JSON.stringify(dict, null, 2));
await browser.close();
