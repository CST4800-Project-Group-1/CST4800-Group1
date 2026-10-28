import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { CatalogLoader, parseCatalog, fetchCatalog, filterParts, categories } from "../dist/catalog.js";

const seed = JSON.parse(await readFile(new URL("../../backend/sample_parts.json", import.meta.url), "utf8"));
const payload = () => ({ status: "success", data: structuredClone(seed) });
const defaults = { search: "", category: "", manufacturer: "", availability: "", maxPriceCents: null };
const response = () => Response.json(payload());

test("loads all 21 seed records with all seven categories and integer-cent prices", () => {
    const catalog = parseCatalog(payload());
    assert.equal(catalog.parts.length, 21);
    assert.equal(catalog.isSampleData, true);
    for (const category of Object.keys(categories)) assert.equal(catalog.parts.filter(p => p.category === category).length, 3);
    assert.equal(catalog.parts[0].priceCents, 15999);
});
test("duplicate IDs are shown once while different IDs with the same name remain", () => {
    const data = payload();
    data.data.parts.push(structuredClone(data.data.parts[0]));
    assert.equal(parseCatalog(data).parts.length, 21);
    data.data.parts.push({ ...data.data.parts[0], id: "new-id" });
    assert.equal(parseCatalog(data).parts.length, 22);
});
test("rejects invalid envelope, schema, prices, unsafe images and missing category specs", () => {
    for (const modify of [p => p.status = "error", p => p.data.schemaVersion = 2,
        p => p.data.parts[0].priceCents = -1, p => p.data.parts[0].currency = "EUR",
        p => p.data.parts[0].category = "unknown", p => delete p.data.parts[0].specs.socket,
        p => { p.data.parts[0].imageIsPlaceholder = false; p.data.parts[0].imageUrl = "javascript:alert(1)"; }]) {
        const data = payload(); modify(data); assert.throws(() => parseCatalog(data), /invalid catalog/);
    }
});
test("valid empty catalog is distinct from a failed catalog", () => {
    const data = payload(); data.data.parts = [];
    assert.deepEqual(parseCatalog(data).parts, []);
});
test("search matches names, models, manufacturers, category labels and specifications without case sensitivity", () => {
    const parts = parseCatalog(payload()).parts;
    for (const query of ["  DEMOCORE c6 ", "am5", "D5-32-6000", "graphics cards", "PCIe 4.0"]) {
        assert.ok(filterParts(parts, { ...defaults, search: query }).length > 0, query);
    }
    assert.equal(filterParts(parts, { ...defaults, search: "no-such-part" }).length, 0);
});
test("category, manufacturer, availability and price filters combine", () => {
    const parts = parseCatalog(payload()).parts;
    const filtered = filterParts(parts, { ...defaults, category: "cpu", manufacturer: "DemoCore", availability: "in_stock", maxPriceCents: 15999 });
    assert.deepEqual(filtered.map(p => p.id), ["cpu-001"]);
    assert.equal(filterParts(parts, { ...defaults, maxPriceCents: 0 }).length, 0);
    assert.equal(filterParts(parts, defaults).length, 21);
});
test("fetch calls the full catalog endpoint with fresh data and the abort signal", async () => {
    const controller = new AbortController();
    const catalog = await fetchCatalog("http://localhost:8080/", controller.signal, async (url, options) => {
        assert.equal(url, "http://localhost:8080/v1/parts");
        assert.equal(options.cache, "no-store"); assert.equal(options.signal, controller.signal);
        return response();
    });
    assert.equal(catalog.parts.length, 21);
});
test("HTTP errors and invalid JSON produce useful errors", async () => {
    await assert.rejects(fetchCatalog("http://localhost", new AbortController().signal, async () => new Response("unavailable", { status: 503 })), /HTTP 503/);
    await assert.rejects(fetchCatalog("http://localhost", new AbortController().signal, async () => new Response("not JSON")), /valid JSON/);
});
test("failed load shows error; retry and reload replace the catalog", async () => {
    const states = []; let calls = 0;
    const loader = new CatalogLoader("http://localhost", state => states.push(state), async () => {
        calls++; if (calls === 1) throw new TypeError("Failed to fetch"); return response();
    });
    await loader.load(); await loader.load(); await loader.load();
    assert.deepEqual(states.map(s => s.kind), ["loading", "error", "loading", "ready", "loading", "ready"]);
    assert.match(states[1].message, /Cannot reach/);
    assert.equal(states.at(-1).catalog.parts.length, 21);
    assert.equal(calls, 3);
});
test("slow previous response cannot overwrite a newer catalog", async () => {
    const states = []; let resolveFirst; let calls = 0; let firstSignal;
    const loader = new CatalogLoader("http://localhost", state => states.push(state), async (_url, options) => {
        if (++calls === 1) { firstSignal = options.signal; return new Promise(resolve => resolveFirst = resolve); }
        const next = payload(); next.data.parts = [next.data.parts[1]]; return Response.json(next);
    });
    const first = loader.load(); await loader.load(); resolveFirst(response()); await first;
    assert.equal(firstSignal.aborted, true);
    assert.equal(states.filter(s => s.kind === "ready").length, 1);
    assert.equal(states.at(-1).catalog.parts[0].id, "cpu-002");
});
test("timeout exits loading and provides a retry message", async () => {
    const states = [];
    const loader = new CatalogLoader("http://localhost", state => states.push(state), (_url, options) => new Promise((_resolve, reject) => {
        options.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    }), 5);
    await loader.load(); assert.equal(states.at(-1).kind, "error"); assert.match(states.at(-1).message, /timed out/);
});
