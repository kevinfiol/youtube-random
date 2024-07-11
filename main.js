import { Hono } from '@hono/hono';
import { secureHeaders } from '@hono/hono/secure-headers';
import { basicAuth } from '@hono/hono/basic-auth';
import { loadSync } from '@std/dotenv';
import { getRandomVideo } from './youtube.js';

loadSync({ export: true });

const SERVER_PORT = Deno.env.get('SERVER_PORT');
const API_KEY = Deno.env.get('GOOGLE_API_KEY');
const USER = Deno.env.get('USER');
const PASSWORD = Deno.env.get('PASSWORD');
const MAX_PAGE_TRAVERSALS = Number(Deno.env.get('MAX_PAGE_TRAVERSALS')) || Infinity;

const app = new Hono();

app.use(secureHeaders());

app.get('/', (c) => c.text('OK'));

app.get('/random', basicAuth({ username: USER, password: PASSWORD }), async (c) => {
  const channelId = c.req.query('channelId') ?? '';
  const payload = { data: '', error: null };

  if (!channelId) {
    payload.error = 'No channel ID provided.';
  } else {
    const { data: video, error } = await getRandomVideo({
      channelId,
      maxPageTraversals: MAX_PAGE_TRAVERSALS,
      key: API_KEY
    });
  
    if (error) {
      payload.error = 'Unable to retrieve random video. Check logs.';
      console.error(error);
    } else {
      payload.data = video;
    }
  }

  return c.json(payload);

// const { data: video, error } = await getRandomVideo('UCp5gkh86mxEpyvgLEQ6uvxg');

// if (error) {
//   console.error(error);
//   Deno.exit(1);
// }
});

Deno.serve({ port: SERVER_PORT }, app.fetch);