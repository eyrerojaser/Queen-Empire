import { getStore } from '@netlify/blobs';
import webpush from 'web-push';
import { handlePush } from '../lib/push-core.mjs';

export const config = { path: '/api/push' };

export default async (req) =>
  handlePush(req, getStore({ name: 'calendar-push', consistency: 'strong' }), {
    generateKeys: () => webpush.generateVAPIDKeys()
  });
