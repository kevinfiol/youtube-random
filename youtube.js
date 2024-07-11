const KV = await Deno.openKv();
const SEARCH_API_URL = 'https://www.googleapis.com/youtube/v3/search';
const VIDEO_API_URL = 'https://www.googleapis.com/youtube/v3/videos';
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

    const res = await fetch(SEARCH_API_URL + '?' + query);
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

export async function getVideoDetails(params = {}) {
  const data = { id: '', channelId: '', channelTitle: '', title: '', imgUrl: '' };
  let error = undefined;

  try {
    const query = new URLSearchParams({
      part: 'snippet',
      ...params
    }).toString();

    const res = await fetch(VIDEO_API_URL + '?' + query);
    const json = await res.json();
    if (json.error) throw Error(json.error.message);
    if (json.items && json.items.length === 0) throw Error('No video found.');

    const item = json.items[0];
    data.id = item.id;
    data.title = item.snippet.title;
    data.channelId = item.snippet.channelId;
    data.channelTitle = item.snippet.channelTitle;
    data.imgUrl = item.snippet.thumbnails.high.url;
  } catch (e) {
    error = e;
  }

  return { data, error };
}

export async function getRandomVideo({ channelId = '', key = '', maxPageTraversals = Infinity } = {}) {
  let videoId = undefined;
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

    await KV.set(['videos', channelId], videos, { expireIn: TWO_DAYS });
    videoId = getRandom(videos);
  } catch (e) {
    error = e;
  }

  return { data: videoId, error };
}
