import { basicAuth, getQuery, H3, serve } from 'h3';
import { loadSync } from '@std/dotenv';
import { getRandomVideo, getVideoDetails } from './youtube.ts';
import type { Video } from './youtube.ts';

interface Payload<T> {
  data: T | null;
  error: string | null;
}

loadSync({ export: true });

const SERVER_PORT = Number(Deno.env.get('SERVER_PORT') ?? 80);
const API_KEY = Deno.env.get('GOOGLE_API_KEY') ?? '';
const USER = Deno.env.get('USER') ?? '';
const PASSWORD = Deno.env.get('PASSWORD') ?? '';
const CACHE_EXPIRY_DAYS = Number(Deno.env.get('CACHE_EXPIRY_DAYS') ?? 14);

const app = new H3();
const auth = basicAuth({ username: USER, password: PASSWORD });

// secure headers
// mix of https://hono.dev/docs/middleware/builtin/secure-headers#supported-options
// and of https://helmet.js.org/#http-header-reference
app.use((ev) => {
  ev.res.headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
  ev.res.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  ev.res.headers.set('Cross-Origin-Resource-Policy', 'same-origin');
  ev.res.headers.set('Origin-Agent-Cluster', '?1');
  ev.res.headers.set('Referrer-Policy', 'no-referrer');
  ev.res.headers.set('X-Content-Type-Options', 'nosniff');
  ev.res.headers.set('X-DNS-Prefetch-Control', 'off');
  ev.res.headers.set('X-Download-Options', 'noopen');
  ev.res.headers.set('X-Frame-Options', 'SAMEORIGIN');
  ev.res.headers.set('X-Permitted-Cross-Domain-Policies', 'none');
  ev.res.headers.set('X-XSS-Protection', '0');
  ev.res.headers.set(
    'Strict-Transport-Security',
    'max-age=15552000; includeSubDomains',
  );
});

app.get('/', () => 'OK');

app.get('/random', async (ev) => {
  const query = getQuery(ev);
  const channelId = query.channelId || '';
  const payload: Payload<Video> = { data: null, error: null };

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
      ev.res.status = 500;
      console.error(e);
      payload.error = 'Unable to retrieve random video. Check logs.';
    }
  }

  return payload;
}, { middleware: [auth] });

serve(app, { port: SERVER_PORT });
