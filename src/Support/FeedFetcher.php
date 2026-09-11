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

        $entries = [];

        foreach ($result->getFeed() as $entry) {
            $entries[] = [
                'guid' => $this->entryGuid($entry),
                'title' => mb_substr(trim((string) $entry->getTitle()), 0, 255),
                'link' => trim((string) $entry->getLink()),
                'content' => $this->entryContent($entry),
                'published_at' => $entry->getLastModified() ?: Carbon::now(),
            ];
        }

        // One batched lookup instead of a SELECT per entry (N+1).
        $existing = Item::query()
            ->where('feed_id', $feed->id)
            ->whereIn('guid', array_column($entries, 'guid'))
            ->pluck('guid')
            ->all();

        $newItems = [];

        foreach ($entries as $payload) {
            if (in_array($payload['guid'], $existing, true)) {
                Item::query()
                    ->where('feed_id', $feed->id)
                    ->where('guid', $payload['guid'])
                    ->update(Arr::only($payload, ['title', 'link', 'content', 'published_at']));

                continue;
            }

            $newItems[] = Item::create(array_merge($payload, [
                'feed_id' => $feed->id,
                'status' => 'pending',
            ]));

            // The same article can appear twice in one feed payload.
            $existing[] = $payload['guid'];
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
     * Return items of this feed whose discussion was deleted on the forum to
     * the approval queue with a "was deleted" marker. They are never
     * auto-published — an admin reviews them in the queue and decides.
     */
    public function resetOrphanedItems(Feed $feed): int
    {
        return Item::query()
            ->where('feed_id', $feed->id)
            ->where('status', 'published')
            ->where(function ($query) {
                $query
                    ->whereNull('discussion_id')
                    ->orWhereNotIn('discussion_id', Discussion::query()->select('id'));
            })
            ->update(['status' => 'pending', 'was_deleted' => true, 'discussion_id' => null]);
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