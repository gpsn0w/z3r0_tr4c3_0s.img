const ASSET_URL = "https://github.com/gpsn0w/z3r0_tr4c3_0s.img/releases/download/z3r0_tr4c3.img/android-11-a57y17lte-personal-bg-v0.4-UNTESTED.zip";
const EXPECTED_SHA256 = "02690bb48d8796d1e935e4dee807909df8624dc285c58d8e6ee44ead33061283";

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (url.pathname === "/health") {
      return json({ ok: true, sha256: EXPECTED_SHA256 });
    }

    if (url.pathname !== "/z3r0-a5.zip") {
      return json({
        ok: true,
        endpoints: ["/health", "/z3r0-a5.zip"],
        sha256: EXPECTED_SHA256
      });
    }

    const upstream = await fetch(ASSET_URL, {
      redirect: "follow",
      headers: { "User-Agent": "z3r0-tr4c3-installer/1.0" }
    });

    if (!upstream.ok || !upstream.body) {
      return new Response(`Upstream error: ${upstream.status}`, {
        status: 502,
        headers: corsHeaders()
      });
    }

    const headers = new Headers(corsHeaders());
    headers.set("Content-Type", "application/octet-stream");
    headers.set("Cache-Control", "public, max-age=300");
    headers.set("X-z3r0-SHA256", EXPECTED_SHA256);
    const len = upstream.headers.get("content-length");
    if (len) headers.set("Content-Length", len);

    return new Response(upstream.body, { status: 200, headers });
  }
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,HEAD,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Range",
    "Access-Control-Expose-Headers": "Content-Length,X-z3r0-SHA256",
    "Cross-Origin-Resource-Policy": "cross-origin"
  };
}

function json(value) {
  return new Response(JSON.stringify(value, null, 2), {
    headers: { ...corsHeaders(), "Content-Type": "application/json; charset=utf-8" }
  });
}
