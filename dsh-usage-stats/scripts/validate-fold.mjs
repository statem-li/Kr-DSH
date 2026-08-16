// Validate dsh-usage-stats fold against the live dsh web API (INTEGRATION test:
// requires a running `dsh web` on :3080):
// 1. for EVERY non-blank session with a tokenUsage projection, page ALL of its
//    events via session.history
// 2. fold them with lib/usage.js foldUsage
// 3. compare totals against the session.list tokenUsage projection
// Exits non-zero on any mismatch.
import { foldUsage, renderUsage } from "../lib/usage.js";

const BASE = "http://127.0.0.1:3080";

async function rpc(method, payload) {
	const body = JSON.stringify({ type: "client-request", rpcId: `val-${Math.random().toString(36).slice(2)}`, method, payload });
	const response = await fetch(`${BASE}/api/${method}`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body
	});
	const message = await response.json();
	if (!message.result?.ok) throw new Error(`${method}: ${message.result?.error?.code} ${message.result?.error?.message}`);
	return message.result.value;
}

/** Page every event of one session (oldest first). */
async function fetchAllEvents(sessionId) {
	const pages = [];
	let beforeSeq;
	let guard = 0;
	for (;;) {
		guard += 1;
		if (guard > 2000) throw new Error(`paging guard for ${sessionId}`);
		const page = await rpc("session.history", {
			sessionId,
			...(beforeSeq === void 0 ? {} : { beforeSeq }),
			maxMessages: 500
		});
		const events = page.events.map((entry) => entry.event);
		if (events.length === 0) break;
		pages.push(events);
		let minSeq = events[0].seq;
		let maxSeq = events[0].seq;
		for (const event of events) {
			if (event.seq < minSeq) minSeq = event.seq;
			if (event.seq > maxSeq) maxSeq = event.seq;
		}
		if (!page.hasMore || minSeq === 0) break;
		beforeSeq = minSeq;
		console.log(`  page ${pages.length}: ${events.length} events, seq ${minSeq}..${maxSeq}, hasMore=${page.hasMore}`);
	}
	return pages.reverse().flat();
}

const list = await rpc("session.list", {});
const candidates = list.items.filter((item) => !item.blank && item.projections?.values?.tokenUsage !== void 0);
console.log(`sessions with tokenUsage projection: ${candidates.length}`);
if (candidates.length === 0) {
	console.error("VALIDATION FAILED: no non-blank session has a tokenUsage projection");
	process.exit(1);
}

const keys = ["inputTokens", "outputTokens", "cacheReadTokens", "cacheWriteTokens"];
let totalMismatches = 0;
for (const item of candidates) {
	const projection = item.projections.values.tokenUsage;
	const sessionId = item.sessionId;
	console.log(`\nvalidating ${sessionId} (projection asOfSeq=${item.projections.asOfSeq})`);
	const allEvents = await fetchAllEvents(sessionId);
	const asOfSeq = item.projections.asOfSeq;
	const projectedEvents = Number.isSafeInteger(asOfSeq) ? allEvents.filter((event) => event.seq <= asOfSeq) : allEvents;
	console.log(`  total events fetched: ${allEvents.length}; compared: ${projectedEvents.length}`);
	const got = renderUsage(foldUsage(projectedEvents), Date.now()).total;
	const expected = {
		inputTokens: projection.uncachedInputTokens ?? 0,
		outputTokens: projection.outputTokens ?? 0,
		cacheReadTokens: projection.cacheReadTokens ?? 0,
		cacheWriteTokens: projection.cacheWriteTokens ?? 0
	};
	let sessionMismatches = 0;
	for (const key of keys) {
		const ok = got[key] === expected[key];
		if (!ok) sessionMismatches += 1;
		console.log(`  ${key}: fold=${got[key]} projection=${expected[key]} ${ok ? "OK" : "MISMATCH"}`);
	}
	if (sessionMismatches > 0) {
		totalMismatches += sessionMismatches;
		console.log(`  SESSION DIFFERS in ${sessionMismatches} buckets`);
	} else {
		console.log("  session OK");
	}
	for (const day of renderUsage(foldUsage(projectedEvents), Date.now()).days) {
		console.log(`  ${day.date}  total=${day.tokens}  input=${day.inputTokens}  output=${day.outputTokens}  cacheRead=${day.cacheReadTokens}`);
	}
}

if (totalMismatches > 0) {
	console.log(`\nVALIDATION FAILED: ${totalMismatches} bucket mismatches across ${candidates.length} session(s)`);
	process.exit(1);
}
console.log(`\nFOLD MATCHES PROJECTION for all ${candidates.length} session(s)`);
