// Registro de personas que usan Mi Calendario + panel de administración.
//
// Guarda un solo documento con la lista de personas (nombre, apellido, correo, fecha).
// El panel de administración se protege con una contraseña que la dueña elige la
// primera vez que abre el panel (no viene configurada de antes).

const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_LEADS = 5000;
const MAX_FAILS = 8;
const LOCK_MS = 15 * 60 * 1000;

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
const clean = (s, n) => String(s || '').trim().slice(0, n);
const ipOf = (req) => req.headers.get('x-nf-client-connection-ip') || req.headers.get('client-ip') || 'sin-ip';

async function checkRate(store, req, now, max, windowMs, bucket) {
  const ip = await sha256(ipOf(req));
  const key = `rl:${bucket}:${ip}`;
  const rec = (await store.get(key, { type: 'json' })) || { count: 0, since: now };
  if (now - rec.since > windowMs) { rec.count = 0; rec.since = now; }
  rec.count++;
  await store.setJSON(key, rec);
  return rec.count <= max;
}

export async function handleLeads(req, store, deps) {
  const url = new URL(req.url);
  const now = deps && deps.now ? deps.now() : Date.now();
  const isAdmin = url.searchParams.get('admin') === '1';

  if (!isAdmin) {
    if (req.method === 'GET') return json({ ok: true });

    if (req.method === 'POST') {
      const text = await req.text();
      if (text.length > 20000) return json({ error: 'too_large' }, 413);
      let body;
      try { body = JSON.parse(text); } catch { return json({ error: 'bad_json' }, 400); }
      if (body && body.hp) return json({ ok: true });                          // trampa para robots: se ignora en silencio
      const name = clean(body && body.name, 60), lastName = clean(body && body.lastName, 60);
      const email = clean(body && body.email, 160).toLowerCase();
      if (!name) return json({ error: 'missing_name' }, 400);
      if (!EMAIL_OK.test(email)) return json({ error: 'bad_email' }, 400);
      if (!(await checkRate(store, req, now, 20, 24 * 3600 * 1000, 'lead'))) return json({ error: 'too_many_requests' }, 429);

      const rec = (await store.get('leads', { type: 'json' })) || { list: [] };
      const i = rec.list.findIndex((x) => x.email === email);
      const entry = { id: i >= 0 ? rec.list[i].id : crypto.randomUUID(), name, lastName, email, created: i >= 0 ? rec.list[i].created : now, updated: now };
      if (i >= 0) rec.list[i] = entry; else rec.list.push(entry);
      if (rec.list.length > MAX_LEADS) rec.list = rec.list.slice(rec.list.length - MAX_LEADS);
      rec._u = now;
      await store.setJSON('leads', rec);
      return json({ ok: true });
    }
    return json({ error: 'method_not_allowed' }, 405);
  }

  // ---- Panel de administración ----
  const cfg = await store.get('admin-cfg', { type: 'json' });

  if (req.method === 'GET') {
    if (!cfg) return json({ ok: true, needsSetup: true });
    const key = req.headers.get('x-admin-key') || '';
    const lock = (await store.get('admin-lock', { type: 'json' })) || { fails: 0, until: 0 };
    if (lock.until > now) return json({ error: 'locked', minutes: Math.ceil((lock.until - now) / 60000) }, 423);
    if ((await sha256(key)) !== cfg.hash) {
      lock.fails = (lock.fails || 0) + 1;
      if (lock.fails >= MAX_FAILS) { lock.until = now + LOCK_MS; lock.fails = 0; }
      await store.setJSON('admin-lock', lock);
      return json({ error: 'wrong_password' }, 401);
    }
    if (lock.fails) await store.setJSON('admin-lock', { fails: 0, until: 0 });
    const rec = (await store.get('leads', { type: 'json' })) || { list: [] };
    return json({ ok: true, leads: rec.list.slice().sort((a, b) => b.created - a.created) });
  }

  if (req.method === 'POST') {
    const text = await req.text();
    if (text.length > 5000) return json({ error: 'too_large' }, 413);
    let body; try { body = JSON.parse(text); } catch { return json({ error: 'bad_json' }, 400); }
    const pass = clean(body && body.password, 200);
    if (pass.length < 4) return json({ error: 'password_too_short' }, 400);
    if (!(await checkRate(store, req, now, 30, 3600 * 1000, 'admin'))) return json({ error: 'too_many_requests' }, 429);

    if (!cfg) {
      await store.setJSON('admin-cfg', { hash: await sha256(pass), updated: now });
      return json({ ok: true });
    }
    const current = clean(body && body.currentPassword, 200);
    if ((await sha256(current)) !== cfg.hash) return json({ error: 'wrong_password' }, 401);
    await store.setJSON('admin-cfg', { hash: await sha256(pass), updated: now });
    return json({ ok: true });
  }

  return json({ error: 'method_not_allowed' }, 405);
}
