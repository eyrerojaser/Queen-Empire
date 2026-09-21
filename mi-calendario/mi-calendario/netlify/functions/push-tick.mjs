import { getStore } from '@netlify/blobs';
import webpush from 'web-push';
import { runTick } from '../lib/push-core.mjs';

// Corre cada minuto y envía los recordatorios que ya tocan.
export const config = { schedule: '* * * * *' };

export default async () => {
  const store = getStore({ name: 'calendar-push', consistency: 'strong' });
  const subject = process.env.URL && /^https:\/\//.test(process.env.URL) ? process.env.URL : 'mailto:avisos@example.com';
  const stats = await runTick(store, {
    send: (sub, payload, vapid) => {
      webpush.setVapidDetails(subject, vapid.publicKey, vapid.privateKey);
      return webpush.sendNotification(sub, JSON.stringify(payload), { TTL: 1800, urgency: 'high' });
    }
  });
  if (stats.sent || stats.failed || stats.removed) console.log('push-tick', JSON.stringify(stats));
};
