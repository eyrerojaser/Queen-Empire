// Avisos de Mi Calendario (notificaciones push).
//
// Cada dispositivo que activa los recordatorios guarda aquí:
//   · su suscripción push (la "dirección" a la que el navegador recibe avisos), y
//   · la lista de recordatorios con la hora exacta (fireAt, en milisegundos UTC).
// Una función programada (push-tick) corre cada minuto y envía los que ya toca enviar.
//
// El "secreto" de cada dispositivo nunca se guarda: solo su huella SHA-256.

const SECRET_OK = /^[A-Z2-9]{24}$/;
const KEY_OK = /^[A-Za-z0-9_-]{16,200}$/;
// Solo servicios push conocidos: así el servidor no puede usarse para llamar a otros sitios.
const ENDPOINT_OK = /^https:\/\/(fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+(\.[a-z0-9-]+)*\.push\.apple\.com|[a-z0-9-]+(\.[a-z0-9-]+)*\.notify\.windows\.com)\//;

export const MAX_DEVICES = 25;
export const MAX_REMINDERS = 300;
const MAX_BODY = 250_000;
const LATE_MS = 2 * 60 * 1000;          // se aceptan recordatorios que vencieron hace menos de 2 min
const GRACE_MS = 30 * 60 * 1000;        // si el servidor se retrasó, todavía se envían hasta 30 min tarde
const SENT_KEEP_MS = 2 * 24 * 3600 * 1000;

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
  });

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Las llaves VAPID identifican a este servidor ante los servicios push.
// Se crean solas la primera vez y se guardan en Netlify Blobs (no hay que configurar nada).
export async function getVapid(store, deps) {
  let v = await store.get('vapid', { type: 'json' });
  if (!v || !v.publicKey || !v.privateKey) {
    const k = deps.generateKeys();
    await store.setJSON('vapid', { publicKey: k.publicKey, privateKey: k.privateKey });
    v = await store.get('vapid', { type: 'json' });
  }
  return v;
}

function validSub(sub) {
  return !!(sub && typeof sub === 'object' && typeof sub.endpoint === 'string' && sub.endpoint.length <= 700 &&
    ENDPOINT_OK.test(sub.endpoint) && sub.keys && KEY_OK.test(sub.keys.p256dh || '') && KEY_OK.test(sub.keys.auth || ''));
}

function cleanReminders(list, now, sent) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const r of list.slice(0, MAX_REMINDERS)) {
    if (!r || typeof r !== 'object') continue;
    const fireAt = Number(r.fireAt);
    if (!Number.isFinite(fireAt) || fireAt < now - LATE_MS || fireAt > now + 400 * 864e5) continue;
    const id = String(r.id || '').slice(0, 64);
    if (!id || (sent && sent[`${id}@${fireAt}`])) continue;                 // ya se envió: no volver a agregarlo
    const url = typeof r.url === 'string' && /^(\.\/|\/|\?)/.test(r.url) ? r.url.slice(0, 200) : './';
    out.push({ id, fireAt, title: String(r.title || 'Recordatorio').slice(0, 120), body: String(r.body || '').slice(0, 200), url });
  }
  return out.sort((a, b) => a.fireAt - b.fireAt);
}

export async function handlePush(req, store, deps) {
  if (req.method === 'GET') {
    const v = await getVapid(store, deps);
    return json({ ok: true, publicKey: v.publicKey });
  }

  const secret = (req.headers.get('x-push-key') || '').trim();
  if (!SECRET_OK.test(secret)) return json({ error: 'invalid_key' }, 401);
  const ns = await sha256(secret);
  const recKey = `d/${ns}`;
  const index = (await store.get('index', { type: 'json' })) || { ids: {} };
  const now = deps.now ? deps.now() : Date.now();

  if (req.method === 'PUT') {
    const text = await req.text();
    if (text.length > MAX_BODY) return json({ error: 'too_large' }, 413);
    let body;
    try { body = JSON.parse(text); } catch { return json({ error: 'bad_json' }, 400); }
    if (!body || !validSub(body.sub)) return json({ error: 'bad_subscription' }, 400);
    if (!index.ids[ns] && Object.keys(index.ids).length >= MAX_DEVICES) return json({ error: 'too_many_devices' }, 429);

    const prev = (await store.get(recKey, { type: 'json' })) || {};
    const sent = {};
    for (const [k, t] of Object.entries(prev.sent || {})) if (now - t < SENT_KEEP_MS) sent[k] = t;
    const reminders = cleanReminders(body.reminders, now, sent);
    await store.setJSON(recKey, { sub: { endpoint: body.sub.endpoint, keys: { p256dh: body.sub.keys.p256dh, auth: body.sub.keys.auth } }, reminders, sent, updated: now });
    index.ids[ns] = now;
    await store.setJSON('index', index);
    return json({ ok: true, count: reminders.length });
  }

  if (req.method === 'DELETE') {
    await store.delete(recKey);
    if (index.ids[ns]) { delete index.ids[ns]; await store.setJSON('index', index); }
    return json({ ok: true });
  }

  return json({ error: 'method_not_allowed' }, 405);
}

// Se ejecuta cada minuto. Envía los recordatorios que ya vencieron y limpia lo que ya no sirve.
export async function runTick(store, deps) {
  const now = deps.now ? deps.now() : Date.now();
  const index = (await store.get('index', { type: 'json' })) || { ids: {} };
  const ids = Object.keys(index.ids);
  const stats = { devices: ids.length, sent: 0, failed: 0, removed: 0 };
  if (!ids.length) return stats;

  let vapid = null, indexChanged = false;
  for (const ns of ids) {
    const rec = await store.get(`d/${ns}`, { type: 'json' });
    if (!rec || !rec.sub) { delete index.ids[ns]; indexChanged = true; continue; }
    const reminders = Array.isArray(rec.reminders) ? rec.reminders : [];
    const sentMap = rec.sent || {};
    const due = reminders.filter((r) => r.fireAt <= now && r.fireAt >= now - GRACE_MS);
    if (!due.length && !reminders.some((r) => r.fireAt < now - GRACE_MS)) continue;

    let gone = false, changed = false;
    const retry = [];
    for (const r of due) {
      const key = `${r.id}@${r.fireAt}`;
      if (sentMap[key]) { changed = true; continue; }
      if (!vapid) vapid = await getVapid(store, deps);
      try {
        await deps.send(rec.sub, { title: r.title, body: r.body, tag: `rem-${r.id}-${r.fireAt}`, url: r.url }, vapid);
        sentMap[key] = now; stats.sent++; changed = true;
      } catch (e) {
        if (e && (e.statusCode === 404 || e.statusCode === 410)) { gone = true; break; }   // el dispositivo ya no quiere avisos
        stats.failed++; retry.push(r);                                                    // se reintenta el minuto siguiente
      }
    }
    if (gone) {
      await store.delete(`d/${ns}`);
      delete index.ids[ns]; indexChanged = true; stats.removed++;
      continue;
    }
    const keep = reminders.filter((r) => r.fireAt > now).concat(retry);
    if (changed || keep.length !== reminders.length) {
      for (const [k, t] of Object.entries(sentMap)) if (now - t > SENT_KEEP_MS) delete sentMap[k];
      await store.setJSON(`d/${ns}`, { ...rec, reminders: keep, sent: sentMap });
    }
  }
  if (indexChanged) await store.setJSON('index', index);
  return stats;
}
