# youtube-random

A microservice that returns a random YouTube video given a YouTube channel ID. Built with Deno and Deno KV.

This microservice caches channel results in an effort to reduce the amount of API calls made to the YouTube API. Google has some [pretty strict](https://developers.google.com/youtube/v3/determine_quota_cost) API quotas (for its free-tier), while also having a very restrictive API, which makes this whole song and dance necessary.

This microservice also uses Basic Authentication in order to further reduce load on your API quotas.

## Usage

```bash
deno task start
curl http://localhost:8080/random?channelId=$YOUTUBE_CHANNEL_ID
```
