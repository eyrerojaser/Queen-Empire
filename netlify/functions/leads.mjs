import { getStore } from '@netlify/blobs';
import { handleLeads } from '../lib/leads-core.mjs';

export const config = { path: '/api/leads' };

export default async (req) => handleLeads(req, getStore({ name: 'calendar-leads', consistency: 'strong' }), {});
