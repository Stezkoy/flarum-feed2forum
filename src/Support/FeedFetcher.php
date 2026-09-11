<?php

namespace Stezkoy\Feed2forum\Support;

use FeedIo\Adapter\Http\Client as FeedIoHttpClient;
use FeedIo\FeedIo;
use Flarum\Discussion\Discussion;
use GuzzleHttp\Client as GuzzleClient;
use Illuminate\Support\Arr;
use Illuminate\Support\Carbon;
use Psr\Log\NullLogger;
use Stezkoy\Feed2forum\Models\Feed;
use Stezkoy\Feed2forum\Models\Item;
use Stezkoy\Feed2forum\Support\WorkLog;

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

        return $this->applyPublishLimit($feed, $newItems);
    }

    /**
     * Keep only the publish_limit newest new items in the queue; the rest are
     * stored as "skipped" so the list does not overflow and older items are
     * not re-detected as new on the next fetch.
     *
     * @param  Item[]  $items
     * @return Item[]
     */
    private function applyPublishLimit(Feed $feed, array $items): array
    {
        $limit = max(0, (int) $feed->publish_limit);

        if ($limit <= 0 || count($items) <= $limit) {
            return $items;
        }

        usort(
            $items,
            fn (Item $a, Item $b): int => $b->published_at?->timestamp ?? 0 <=> $a->published_at?->timestamp ?? 0
        );

        $kept = array_slice($items, 0, $limit);

        $skipped = array_slice($items, $limit);

        foreach ($skipped as $item) {
            $item->status = 'skipped';
            $item->save();
        }

        WorkLog::info(
            'Skipped '.count($skipped).' older item(s) of "'.$feed->title.'" (publish limit '.$limit.').',
            $feed->id
        );

        return $kept;
    }

    /**
     * Return items whose discussion was deleted on the forum back to the
     * approval queue, so they can be published again.
     */
    public function resetOrphanedItems(): int
    {
        return Item::query()
            ->where('status', 'published')
            ->where(function ($query) {
                $query
                    ->whereNull('discussion_id')
                    ->orWhereNotIn('discussion_id', Discussion::query()->select('id'));
            })
            ->update(['status' => 'pending', 'discussion_id' => null]);
    }

    public function feedIo(): FeedIo
    {        $guzzle = new GuzzleClient([
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
        $guid = trim((string) $entry->getPublicId());
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