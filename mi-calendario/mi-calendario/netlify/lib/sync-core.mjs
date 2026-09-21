// Lógica de sincronización de Mi Calendario.
// Guarda cada "elemento" (un mes, tus ajustes o una foto) en Netlify Blobs,
// separado por un espacio privado que sale del código de sincronización.
// El código nunca se guarda: solo se guarda su huella (SHA-256).

const MAX_BODY = 5_500_000;                       // el límite de una función de Netlify es ~6 MB
const KEY_OK = /^(prefs|acts|vision|m:\d{4}-\d{2}|p:[0-9a-f]{64})$/;
const CODE_OK = /^[A-Z2-9]{24}$/;

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
  });

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function handle(req, store) {
  const url = new URL(req.url);
  if (url.searchParams.has('ping')) return json({ ok: true, v: 1 });

  const code = (req.headers.get('x-sync-key') || '').trim();
  if (!CODE_OK.test(code)) return json({ error: 'invalid_code' }, 401);

  const ns = await sha256(code);
  const key = url.searchParams.get('key') || 'index';
  const indexKey = `${ns}/index`;
  const itemKey = (k) => `${ns}/i/${encodeURIComponent(k)}`;

  if (req.method === 'GET') {
    if (key === 'index') return json((await store.get(indexKey, { type: 'json' })) || { items: {} });
    if (!KEY_OK.test(key)) return json({ error: 'bad_key' }, 400);
    const item = await store.get(itemKey(key), { type: 'json' });
    return item ? json(item) : json({ error: 'not_found' }, 404);
  }

  if (req.method === 'PUT') {
    if (!KEY_OK.test(key)) return json({ error: 'bad_key' }, 400);
    const text = await req.text();
    if (text.length > MAX_BODY) return json({ error: 'too_large' }, 413);
    let body;
    try { body = JSON.parse(text); } catch { return json({ error: 'bad_json' }, 400); }
    if (!body || !('value' in body)) return json({ error: 'bad_body' }, 400);

    const u = Number(body.u) || 0;
    const isPhoto = key.startsWith('p:');
    const current = await store.get(itemKey(key), { type: 'json' });

    if (current && isPhoto) return json({ ok: true, kept: true });          // las fotos no cambian
    if (current && current.u >= u) return json({ ok: true, stale: true, u: current.u });

    await store.setJSON(itemKey(key), { u, value: body.value });
    if (!isPhoto) {
      const index = (await store.get(indexKey, { type: 'json' })) || { items: {} };
      index.items[key] = u;
      await store.setJSON(indexKey, index);
    }
    return json({ ok: true, u });
  }

  return json({ error: 'method_not_allowed' }, 405);
}
