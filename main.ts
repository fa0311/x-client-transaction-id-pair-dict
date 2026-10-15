import fs from "fs/promises";
import http from "node:http";
import { SocksClient } from "socks";
import puppeteer from "puppeteer";
import { createSession } from "x-client-transaction-id-extract-browser";

interface Dict {
  animationKey: string;
  verification: string;
}

const withTimeout = <T>(promise: Promise<T>, timeoutMs: number): Promise<T> =>
  new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timed out after ${timeoutMs}ms`)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });

// PROXY_LIST: one proxy URL per line (socks5h://user:pass@host:port); legacy host:port:user:pass means HTTP
const parseProxy = (line: string) => {
  if (line.includes("://")) return new URL(line);
  const [host, port, username, password] = line.split(":");
  return new URL(`http://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}:${port}`);
};

const proxies = (process.env.PROXY_LIST ?? "")
  .split("\n")
  .map((line) => line.trim())
  .filter(Boolean)
  .map(parseProxy);
const proxy = proxies.length > 0 ? proxies[Math.floor(Math.random() * proxies.length)] : undefined;

// Chrome cannot authenticate against SOCKS proxies: expose the SOCKS upstream as a local HTTP CONNECT proxy
const socksBridge = async (upstream: URL) => {
  const server = http.createServer((_, res) => res.writeHead(405).end());
  server.on("connect", async (req, socket, head) => {
    const [host, port] = (req.url ?? "").split(":");
    try {
      const { socket: remote } = await SocksClient.createConnection({
        proxy: {
          host: upstream.hostname,
          port: Number(upstream.port),
          type: 5,
          userId: decodeURIComponent(upstream.username),
          password: decodeURIComponent(upstream.password),
        },
        command: "connect",
        destination: { host, port: Number(port) },
      });
      socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      remote.write(head);
      socket.pipe(remote).pipe(socket);
    } catch (e) {
      console.error(e);
      socket.end("HTTP/1.1 502 Bad Gateway\r\n\r\n");
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("bridge not listening");
  return { url: `http://127.0.0.1:${address.port}`, close: () => server.close() };
};

const bridge = proxy?.protocol.startsWith("socks") ? await socksBridge(proxy) : undefined;
const proxyServer = bridge?.url ?? (proxy ? `${proxy.protocol}//${proxy.host}` : undefined);

const dict: Dict[] = [];
const max = Number(process.env.PAIR_MAX ?? 30);
const browser = await puppeteer.launch({
  headless: true,
  protocolTimeout: 60000,
  args: [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-accelerated-2d-canvas",
    "--disable-gpu",
    ...(proxyServer ? [`--proxy-server=${proxyServer}`] : []),
  ],
});

for (let i = 0; i < max; i++) {
  console.log(`${i} / ${max}`);
  const page = await browser.newPage();
  try {
    page.setDefaultNavigationTimeout(15000);
    const userAgent = await page.evaluate(() => (globalThis as any).navigator.userAgent);
    await page.setUserAgent(userAgent.replace("HeadlessChrome/", "Chrome/"));

    if (proxy && !bridge && proxy.username) {
      await page.authenticate({ username: decodeURIComponent(proxy.username), password: decodeURIComponent(proxy.password) });
    }
    const session = await createSession(browser, page);
    const keyConverter = await session.initKeyConverter();
    const animationKey = await withTimeout(keyConverter(), 10000);
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
bridge?.close();
