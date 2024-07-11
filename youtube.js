import lz from 'lz-string';

const KV = await Deno.openKv();
const API_URL = 'https://www.googleapis.com/youtube/v3/search';
const SEVEN_DAYS = 7 * 8.64 * Math.pow(10, 7);
const TWO_DAYS = 2 * 8.64 * Math.pow(10, 7);

const ORDERS = [
  'date',
  'rating',
  'relevance',
  'title',
  'videoCount',
  'viewCount',
];

function getRandom(arr = []) {
  const idx = Math.floor(Math.random() * arr.length);
  return arr[idx];
}

async function getPages(channelId = '') {
  const res = await KV.get(['pages', channelId]);
  return res.value ?? [];
}

async function getVideos(channelId = '') {
  const res = await KV.get(['videos', channelId]);
  return res.value ?? [];
}

async function search(params = {}) {
  const data = { next: '', prev: '', items: [] };
  let error = undefined;

  try {
    const query = new URLSearchParams({
      maxResults: 50,
      type: 'video',
      ...params
    }).toString();

    const res = await fetch(API_URL + '?' + query);
    const json = await res.json();
    if (json.error) throw Error(json.error.message);

    data.items = json.items.map((i) => i.id.videoId);
    data.next = json.nextPageToken ?? '';
    data.prev = json.prevPageToken ?? '';
  } catch (e) {
    error = e;
  }

  return { data, error };
}

export async function getRandomVideo({ channelId = '', key = '', maxPageTraversals = Infinity } = {}) {
  let video = undefined;
  let error = undefined;

  try {
    if (!channelId || !channelId.trim()) {
      throw Error('Must provide channel ID');
    }

    let videos = await getVideos(channelId);
    let traversals = 0;
    let next = '';

    if (videos.length > 0) {
      // videos are cached; select one at random and return
      return { data: getRandom(videos), error };
    }

    const order = getRandom(ORDERS);
    const pages = await getPages(channelId);
    const isPagesCached = pages.length > 0;

    if (isPagesCached) {
      // we already have the pageTokens; select a page at random
      next = getRandom(pages);
      traversals = maxPageTraversals;
    }

    do {
      const { data, error } = await search({
        key,
        channelId,
        order,
        pageToken: next,
      });

      if (error) throw error;

      if (!isPagesCached) {
        if (data.next) pages.push(data.next);
        if (data.prev) pages.push(data.prev);
      }

      next = data.next;
      videos = [...videos, ...data.items];
      traversals += 1;
    } while (next && traversals < maxPageTraversals);

    if (!isPagesCached) {
      // store page tokens for a week
      const uniquePageTokens = Array.from(new Set(pages));
      KV.set(['pages', channelId], uniquePageTokens, { expireIn: SEVEN_DAYS });
    }

    video = getRandom(videos);
  } catch (e) {
    error = e;
  }

  return { data: video, error };
}
