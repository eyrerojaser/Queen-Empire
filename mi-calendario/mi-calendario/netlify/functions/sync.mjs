import { getStore } from '@netlify/blobs';
import { handle } from '../lib/sync-core.mjs';

export const config = { path: '/api/sync' };

export default async (req) => handle(req, getStore({ name: 'calendar-sync', consistency: 'strong' }));
