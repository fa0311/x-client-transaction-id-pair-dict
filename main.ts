import fs from "fs/promises";
import puppeteer from "puppeteer";
import { createSession } from "x-client-transaction-id-extract-browser";

interface Dict {
  animationKey: string;
  verification: string;
}

const dict: Dict[] = [];
const max = 30;
const browser = await puppeteer.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-accelerated-2d-canvas", "--disable-gpu"],
});

for (let i = 0; i < max; i++) {
  console.log(`${i} / ${max}`);
  try {
    const session = await createSession(browser, undefined);
    const keyConverter = await session.initKeyConverter();
    const animationKey = await keyConverter();
    dict.push({
      animationKey: animationKey.split("obfiowerehiring")[1],
      verification: session.verification,
    });
  } catch (e) {
    console.error(e);
  }
}

await fs.writeFile("pair.json", JSON.stringify(dict, null, 2));
await browser.close();
