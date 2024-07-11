const KV = await Deno.openKv();
const API_URL = 'https://www.googleapis.com/youtube/v3/search';
const SEVEN_DAYS = 7 * 8.64 * Math.pow(10, 7);

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
    const order = getRandom(ORDERS);

    if (videos.length > 0) {
      // videos are cached; select one at random and return
      return { data: getRandom(videos), error };
    }

    do {
      const { data, error } = await search({
        key,
        channelId,
        order,
        pageToken: next,
      });

      if (error) throw error;
      next = data.next;
      videos = [...videos, ...data.items];
      traversals += 1;
    } while (next && traversals < maxPageTraversals);

    video = getRandom(videos);
  } catch (e) {
    error = e;
  }

  return { data: video, error };
}
