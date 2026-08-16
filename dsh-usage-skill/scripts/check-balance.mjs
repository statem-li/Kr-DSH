// One-off check: call the DeepSeek balance API with the stored credential.
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const dshHome = process.env.DSH_HOME ?? join(homedir(), ".dsh");
const raw = readFileSync(join(dshHome, ".credentials.yaml"), "utf8");
const match = raw.match(/DEEPSEEK_API_KEY\s*:\s*["']?([^"'\r\n]+)/);
if (!match) {
	console.log("NO KEY FOUND");
	process.exit(1);
}
const key = match[1].trim();
const response = await fetch("https://api.deepseek.com/user/balance", {
	headers: { authorization: `Bearer ${key}` }
});
console.log("HTTP", response.status);
console.log(JSON.stringify(await response.json(), null, 1));
