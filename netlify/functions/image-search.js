// Proxies Google Custom Image Search so the API key stays server-side.
// Set GOOGLE_API_KEY and GOOGLE_CX as environment variables in Netlify.
exports.handler = async (event) => {
  const { q } = event.queryStringParameters || {};
  if (!q) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing query parameter: q" }) };
  }

  const key = process.env.GOOGLE_API_KEY;
  const cx  = process.env.GOOGLE_CX;
  if (!key || !cx) {
    return { statusCode: 500, body: JSON.stringify({ error: "Server misconfigured: missing API credentials" }) };
  }

  const url = `https://www.googleapis.com/customsearch/v1?q=${encodeURIComponent(q)}&searchType=image&key=${key}&cx=${cx}&num=1`;
  try {
    const res  = await fetch(url);
    const data = await res.json();
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    };
  } catch (err) {
    return { statusCode: 502, body: JSON.stringify({ error: "Upstream request failed", detail: err.message }) };
  }
};
