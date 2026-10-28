// A development-only static server. The C++ API runs separately on port 8080.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const routes = new Map([
    ["/", ["index.html", "text/html; charset=utf-8"]],
    ["/index.html", ["index.html", "text/html; charset=utf-8"]],
    ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
    ["/dist/index.js", ["dist/index.js", "text/javascript; charset=utf-8"]],
    ["/dist/catalog.js", ["dist/catalog.js", "text/javascript; charset=utf-8"]]
]);

const server = createServer(async (request, response) => {
    const path = new URL(request.url, "http://localhost").pathname;
    const route = routes.get(path);
    if (request.method !== "GET" && request.method !== "HEAD") {
        response.writeHead(405, { Allow: "GET, HEAD" }).end();
        return;
    }
    if (!route) {
        response.writeHead(404).end("Not found");
        return;
    }
    try {
        const content = await readFile(fileURLToPath(new URL(route[0], root)));
        response.writeHead(200, { "Content-Type": route[1], "Cache-Control": "no-store" });
        response.end(request.method === "HEAD" ? undefined : content);
    } catch {
        response.writeHead(404).end("File missing. Run npm run build first.");
    }
});
server.on("error", error => { console.error(error.message); process.exitCode = 1; });
server.listen(3000, "127.0.0.1", () => console.log("Parts interface: http://localhost:3000"));
