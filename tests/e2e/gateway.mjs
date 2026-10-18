// Minimal stand-in for Supabase's API gateway: fake GoTrue + proxy to PostgREST.
import http from "node:http";
import crypto from "node:crypto";
const SECRET = "super-secret-jwt-token-with-at-least-32-characters-long";
const USERS = {
  "raja@example.com": "11111111-1111-1111-1111-111111111111",
  "jo@example.com": "22222222-2222-2222-2222-222222222222",
};
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
export function sign(payload) {
  const h = b64({ alg: "HS256", typ: "JWT" }), p = b64(payload);
  const s = crypto.createHmac("sha256", SECRET).update(`${h}.${p}`).digest("base64url");
  return `${h}.${p}.${s}`;
}
function verify(t) {
  const [h, p, s] = (t || "").split(".");
  if (!s) return null;
  const e = crypto.createHmac("sha256", SECRET).update(`${h}.${p}`).digest("base64url");
  if (e !== s) return null;
  return JSON.parse(Buffer.from(p, "base64url").toString());
}
const userObj = (email, id) => ({ id, email, aud: "authenticated", role: "authenticated",
  app_metadata: { provider: "email" }, user_metadata: {}, created_at: "2026-10-01T00:00:00Z" });
function session(email) {
  const id = USERS[email], now = Math.floor(Date.now() / 1000);
  const access_token = sign({ sub: id, email, role: "authenticated", aud: "authenticated", iat: now, exp: now + 3600, session_id: "s1" });
  return { access_token, token_type: "bearer", expires_in: 3600, expires_at: now + 3600, refresh_token: `r-${email}`, user: userObj(email, id) };
}
const body = (req) => new Promise((r) => { let d = ""; req.on("data", (c) => (d += c)); req.on("end", () => r(d)); });
const json = (res, code, o) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname.startsWith("/auth/v1/")) {
    const path = url.pathname.slice(9);
    if (path === "token") {
      const b = JSON.parse((await body(req)) || "{}");
      const gt = url.searchParams.get("grant_type");
      if (gt === "password") {
        if (USERS[b.email] && b.password === "test1234") return json(res, 200, session(b.email));
        return json(res, 400, { code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" });
      }
      if (gt === "refresh_token") {
        const email = String(b.refresh_token || "").slice(2);
        if (USERS[email]) return json(res, 200, session(email));
      }
      return json(res, 400, { msg: "bad grant" });
    }
    if (path === "user") {
      const c = verify((req.headers.authorization || "").replace("Bearer ", ""));
      if (!c || c.role !== "authenticated") return json(res, 401, { msg: "invalid JWT" });
      return json(res, 200, userObj(c.email, c.sub));
    }
    if (path === "logout") { res.writeHead(204); return res.end(); }
    if (path === ".well-known/jwks.json") return json(res, 200, { keys: [] });
    return json(res, 404, { msg: "not implemented " + path });
  }
  if (url.pathname.startsWith("/rest/v1/")) {
    const b = await body(req);
    const headers = { ...req.headers, host: "localhost:3001" };
    delete headers["content-length"];
    const up = await fetch("http://localhost:3001" + url.pathname.slice(8) + url.search, {
      method: req.method, headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : b,
    });
    const out = Buffer.from(await up.arrayBuffer());
    const h = {}; up.headers.forEach((v, k) => { if (!["content-encoding", "transfer-encoding", "content-length"].includes(k)) h[k] = v; });
    res.writeHead(up.status, h); return res.end(out);
  }
  json(res, 404, { msg: "unknown" });
}).listen(54321, () => console.log("gateway on 54321"));
if (process.argv[2] === "anon") console.log(sign({ role: "anon", iss: "supabase", iat: 1700000000, exp: 2000000000 }));
