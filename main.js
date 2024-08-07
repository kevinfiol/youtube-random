import { Hono } from '@hono/hono';
import { secureHeaders } from '@hono/hono/secure-headers';
import { basicAuth } from '@hono/hono/basic-auth';
import { loadSync } from '@std/dotenv';
import { getRandomVideo, getVideoDetails } from './youtube.js';

loadSync({ export: true });

const SERVER_PORT = Number(Deno.env.get('SERVER_PORT')) ?? 80;
const API_KEY = Deno.env.get('GOOGLE_API_KEY') ?? '';
const USER = Deno.env.get('USER') ?? '';
const PASSWORD = Deno.env.get('PASSWORD') ?? '';
const CACHE_EXPIRY_DAYS = Number(Deno.env.get('CACHE_EXPIRY_DAYS')) ?? 14;

const app = new Hono();

app.use(secureHeaders());

app.get('/', (c) => c.text('OK'));

app.get(
  '/random',
  basicAuth({ username: USER, password: PASSWORD }),
  async (c) => {
    const channelId = c.req.query('channelId') ?? '';
    const payload = { data: null, error: null };

    if (!channelId) {
      payload.error = 'No channel ID provided.';
    } else {
      try {
        const { data: videoId, error: searchError } = await getRandomVideo({
          channelId,
          key: API_KEY,
          cacheExpiryDays: CACHE_EXPIRY_DAYS,
        });

        if (searchError) throw searchError;

        const { data: video, error: videoError } = await getVideoDetails({
          id: videoId,
          key: API_KEY,
        });

        if (videoError) throw videoError;
        payload.data = video;
      } catch (e) {
        console.error(e);
        payload.error = 'Unable to retrieve random video. Check logs.';
      }
    }

    return c.json(payload);
  },
);

Deno.serve({ port: SERVER_PORT }, app.fetch);
