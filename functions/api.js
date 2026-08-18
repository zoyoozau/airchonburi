export async function onRequestPost({ request, env }) {
  if (!env.GAS_WEB_APP_URL) return json({ ok: false, error: "ยังไม่ได้ตั้งค่า GAS_WEB_APP_URL" }, 500);
  const body = await request.text();
  const upstream = await fetch(env.GAS_WEB_APP_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body });
  const text = await upstream.text();
  return new Response(text, { status: upstream.status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
}

export async function onRequestGet() { return json({ ok: true, service: "air-care-api-proxy" }); }
function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } }); }
