const KV = await Deno.openKv();
const CHANNELS_API_URL = 'https://www.googleapis.com/youtube/v3/channels';
const PLAYLIST_API_URL = 'https://www.googleapis.com/youtube/v3/playlistItems';
const VIDEO_EXPIRY = 14 * 8.64 * Math.pow(10, 7);

function getRandom(arr = []) {
  const idx = Math.floor(Math.random() * arr.length);
  return arr[idx];
}

async function getVideos(channelId = '') {
  const res = await KV.get(['videos', channelId]);
  return res.value ?? [];
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
  const data = { nextPageToken: '', videos: [] };
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

    data.videos = json.items.map((i) => ({
      ...i.snippet,
      id: i.snippet.resourceId.videoId,
      channelId: i.snippet.videoOwnerChannelId,
      thumbnail: i.snippet.thumbnails.high.url,
      author: i.snippet.channelTitle,
    }));
  } catch (e) {
    error = e;
  }

  return { data, error };
}

export async function getRandomVideo({ channelId = '', key = '' }) {
  let video = undefined;
  let error = undefined;
  let traversals = 0;

  try {
    if (!channelId || !channelId.trim()) {
      throw Error('Must provide channel ID');
    }

    let videos = await getVideos(channelId);
    let nextPageToken = '';

    if (videos.length > 0) {
      return { data: getRandom(videos), error };
    }

    const { data: playlistId } = await getPlaylistId({
      id: channelId,
      key,
    });

    do {
      traversals += 1;
      console.log({ traversals, nextPageToken });
      const { data, error } = await getPlaylistVideos({
        key,
        playlistId,
        pageToken: nextPageToken
      });

      if (error) throw error;

      nextPageToken = data.nextPageToken;
      videos = [...videos, ...data.videos];
    } while (nextPageToken);

    console.log('done with traversals ', traversals);
    await KV.set(['videos', channelId], videos, { expireIn: VIDEO_EXPIRY });
    video = getRandom(videos);
  } catch (e) {
    error = e;
  }

  return { data: video, error };
}
