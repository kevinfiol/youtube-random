import lz from 'lz';

const KV = await Deno.openKv();
const CHANNELS_API_URL = 'https://www.googleapis.com/youtube/v3/channels';
const PLAYLIST_API_URL = 'https://www.googleapis.com/youtube/v3/playlistItems';
const VIDEO_API_URL = 'https://www.googleapis.com/youtube/v3/videos';

function daysToMs(days = 0) {
  return days * 8.64 * Math.pow(10, 7);
}

function getRandom(arr = []) {
  const idx = Math.floor(Math.random() * arr.length);
  return arr[idx];
}

async function getVideos(channelId = '') {
  const res = await KV.get(['videos', channelId]);
  return res.value ? JSON.parse(lz.decompress(res.value)) : [];
}

export async function getVideoDetails(params = {}) {
  let data = {
    id: '',
    channelId: '',
    channelTitle: '',
    title: '',
    thumbnail: '',
  };

  let error = undefined;

  try {
    const query = new URLSearchParams({
      part: 'snippet',
      ...params,
    }).toString();

    const res = await fetch(VIDEO_API_URL + '?' + query);
    const json = await res.json();

    if (json.error) throw Error(json.error.message);
    if (json.items && json.items.length === 0) throw Error('No video found.');
    const item = json.items[0];

    data = {
      id: item.id,
      title: item.snippet.title,
      channelId: item.snippet.channelId,
      author: item.snippet.channelTitle,
      thumbnail: item.snippet.thumbnails.high.url,
    };
  } catch (e) {
    error = e;
  }

  return { data, error };
}

async function getPlaylistId({ id = '', key = '' }) {
  let playlistId = '';
  let error = undefined;

  try {
    const query = new URLSearchParams({
      key,
      id,
      part: 'contentDetails',
    }).toString();

    const json = await fetch(CHANNELS_API_URL + '?' + query)
      .then((r) => r.json());

    if (json.error) {
      throw Error(json.error.message);
    } else if (json.items && json.items.length < 1) {
      throw Error('Playlist for channel uploads not found.');
    }

    playlistId = json.items[0].contentDetails.relatedPlaylists.uploads;
  } catch (e) {
    error = e;
  }

  return { data: playlistId, error };
}

async function getPlaylistVideos({ key = '', playlistId = '', ...params }) {
  const data = { nextPageToken: '', videoIds: [] };
  let error = undefined;

  try {
    const query = new URLSearchParams({
      key,
      playlistId,
      part: 'snippet',
      maxResults: 50,
      ...params,
    }).toString();

    const json = await fetch(PLAYLIST_API_URL + '?' + query)
      .then((r) => r.json());

    if (json.error) throw Error(json.error.message);
    data.nextPageToken = json.nextPageToken || '';

    data.videoIds = json.items.map((i) => i.snippet.resourceId.videoId);
  } catch (e) {
    error = e;
  }

  return { data, error };
}

export async function getRandomVideo({
  channelId = '',
  key = '',
  cacheExpiryDays = 14,
}) {
  let videoId = undefined;
  let error = undefined;

  try {
    if (!channelId || !channelId.trim()) {
      throw Error('Must provide channel ID');
    }

    let videoIds = await getVideos(channelId);
    let nextPageToken = '';

    if (videoIds.length > 0) {
      return { data: getRandom(videoIds), error };
    }

    const { data: playlistId } = await getPlaylistId({
      id: channelId,
      key,
    });

    do {
      const { data, error } = await getPlaylistVideos({
        key,
        playlistId,
        pageToken: nextPageToken,
      });

      if (error) throw error;

      nextPageToken = data.nextPageToken;
      videoIds = [...videoIds, ...data.videoIds];
    } while (nextPageToken);

    videoId = getRandom(videoIds);

    // compress and cache results
    const compressed = lz.compress(JSON.stringify(videoIds));
    await KV.set(['videos', channelId], compressed, {
      expireIn: daysToMs(cacheExpiryDays),
    });
  } catch (e) {
    error = e;
  }

  return { data: videoId, error };
}
