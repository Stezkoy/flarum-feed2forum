<?php

namespace Stezkoy\Feed2forum\Support;

use FeedIo\Adapter\Http\Client as FeedIoHttpClient;
use FeedIo\FeedIo;
use GuzzleHttp\Client as GuzzleClient;
use Illuminate\Support\Arr;
use Illuminate\Support\Carbon;
use Psr\Log\NullLogger;
use Stezkoy\Feed2forum\Models\Feed;
use Stezkoy\Feed2forum\Models\Item;

class FeedFetcher
{
    /**
     * Read the feed and upsert its items. Returns the items that are new to
     * this feed (still pending publication) so the caller can decide how many
     * of them to publish.
     *
     * @return Item[]
     */
    public function fetchFeed(Feed $feed): array
    {
        $result = $this->feedIo()->read($feed->url);

        $newItems = [];

        foreach ($result->getFeed() as $entry) {
            $payload = [
                'feed_id' => $feed->id,
                'guid' => $this->entryGuid($entry),
                'title' => mb_substr(trim((string) $entry->getTitle()), 0, 255),
                'link' => trim((string) $entry->getLink()),
                'content' => $this->entryContent($entry),
                'published_at' => $entry->getLastModified() ?: Carbon::now(),
            ];

            $existing = Item::where('feed_id', $feed->id)
                ->where('guid', $payload['guid'])
                ->first();

            if ($existing) {
                $existing->fill(Arr::only($payload, ['title', 'link', 'content', 'published_at']))->save();

                continue;
            }

            $newItems[] = Item::create(array_merge($payload, ['status' => 'pending']));
        }

        return $newItems;
    }

    public function feedIo(): FeedIo
    {
        $guzzle = new GuzzleClient([
            'timeout' => 15,
            'connect_timeout' => 8,
        ]);

        return new FeedIo(
            new FeedIoHttpClient($guzzle),
            new NullLogger()
        );
    }

    protected function entryGuid(\FeedIo\Feed\Item $entry): string
    {
        $guid = trim((string) $entry->getId());
        $link = trim((string) $entry->getLink());

        if ($guid !== '') {
            return md5($guid);
        }

        if ($link !== '') {
            return md5($link);
        }

        return md5((string) $entry->getTitle().($entry->getLastModified()?->format('Y-m-d H:i:s') ?? ''));
    }

    protected function entryContent(\FeedIo\Feed\Item $entry): string
    {
        return (string) ($entry->getValue('content:encoded') ?: ($entry->getValue('description') ?: $entry->getContent()));
    }
}