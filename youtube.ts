import lz from 'lz-string';
import { Innertube, YTNodes } from 'youtubei.js';

export interface Video {
  id: string;
  channelId: string;
  author: string;
  title: string;
  thumbnail: string;
}

export interface VideoSearchResult {
  type: 'video';
  id: string;
  channelId: string;
  author: string;
  title: string;
  thumbnail: string;
  published: string;
  length: string;
  views: string;
}

export interface PlaylistSearchResult {
  type: 'playlist';
  id: string;
  thumbnail?: string;
  title?: string;
}

const KV = await Deno.openKv();
const CHANNELS_API_URL = 'https://www.googleapis.com/youtube/v3/channels';
const PLAYLIST_API_URL = 'https://www.googleapis.com/youtube/v3/playlistItems';
const VIDEO_API_URL = 'https://www.googleapis.com/youtube/v3/videos';

function daysToMs(days = 0) {
  return days * 8.64 * Math.pow(10, 7);
}

function getRandom<T>(arr: T[] = []) {
  const idx = Math.floor(Math.random() * arr.length);
  return arr[idx];
}

async function getVideoIds(channelId = '') {
  const res = await KV.get(['videos', channelId]);
  return (res.value
    ? JSON.parse(lz.decompress(res.value as string))
    : []) as string[];
}

export async function getVideoDetails(params = {}) {
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
    const video: Video = {
      id: item.id as string,
      title: item.snippet.title as string,
      channelId: item.snippet.channelId as string,
      author: item.snippet.channelTitle as string,
      thumbnail: item.snippet.thumbnails.high.url as string,
    };

    return { data: video };
  } catch (e) {
    return { error: e as Error };
  }
}

async function getPlaylistId({ id = '', key = '' }) {
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

    const playlistId = json.items[0].contentDetails.relatedPlaylists.uploads;
    return { data: playlistId as string };
  } catch (e) {
    return { error: e as Error };
  }
}

async function getPlaylistVideos({ key = '', playlistId = '', ...params }) {
  try {
    const query = new URLSearchParams({
      key,
      playlistId,
      part: 'snippet',
      maxResults: '50',
      ...params,
    }).toString();

    const json = await fetch(PLAYLIST_API_URL + '?' + query)
      .then((r) => r.json());
    if (json.error) throw Error(json.error.message);

    const items = json.items as {
      snippet: { resourceId: { videoId: string } };
    }[];

    const data = {
      nextPageToken: json.nextPageToken || '',
      videoIds: items.map((i) => i.snippet.resourceId.videoId),
    };

    return { data };
  } catch (e) {
    return { error: e as Error };
  }
}

export async function getRandomVideo({
  channelId = '',
  key = '',
  cacheExpiryDays = 14,
} = {}) {
  let videoId = undefined;
  let error = undefined;

  try {
    if (!channelId || !channelId.trim()) {
      throw Error('Must provide channel ID');
    }

    // get all video ids for given channel
    let videoIds = await getVideoIds(channelId);
    let nextPageToken = '';

    // return early if cache exists
    if (videoIds.length > 0) {
      return { data: getRandom(videoIds), error };
    }

    // get playlistId for given channel
    const { data: playlistId, error: playlistError } = await getPlaylistId({
      id: channelId,
      key,
    });

    if (playlistError) {
      throw Error('Could not find playlist for given channelId');
    }

    // iterate through channel pages to create new cache and select random video
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

export async function search(query = '', pages = 3) {
  try {
    const innertube = await Innertube.create();
    const searchResponse = await innertube.search(query, {
      prioritize: 'relevance',
      upload_date: 'all',
    });

    let tmp = [...searchResponse.results];
    for (let i = 1; i < pages; i++) {
      const nextSearchResponse = await searchResponse.getContinuation();
      tmp = [...tmp, ...nextSearchResponse.results];
    }

    // filter out everything except videos and playlists
    tmp = tmp.filter((r) => r.is(YTNodes.Video) || r.is(YTNodes.LockupView));

    const results: (VideoSearchResult | PlaylistSearchResult)[] = [];
    for (const r of tmp) {
      if (r.is(YTNodes.LockupView)) {
        const playlist: PlaylistSearchResult = {
          type: 'playlist',
          id: r.content_id,
          title: r.metadata?.title.text,
          thumbnail: r.content_image?.as(YTNodes.CollectionThumbnailView)
            .primary_thumbnail?.image.at(1)?.url,
        };

        results.push(playlist);
      } else if (r.is(YTNodes.Video)) {
        const video: VideoSearchResult = {
          type: 'video',
          id: r.video_id,
          channelId: r.author.id,
          author: r.author.name,
          title: r.title.text ?? r.video_id,
          thumbnail: r.thumbnails.at(0)!.url,
          published: r.published?.text ?? '',
          length: r.length_text?.text ?? '',
          views: r.short_view_count?.text ?? '',
        };

        results.push(video);
      } else {
        console.log('neither');
      }
    }

    return { data: results };
    // return { data: [] };
  } catch (e) {
    return { error: e as Error };
  }
}
