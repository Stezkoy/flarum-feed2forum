<?php

namespace Stezkoy\Feed2forum\Support;

use FeedIo\Adapter\Http\Client as FeedIoHttpClient;
use FeedIo\FeedIo;
use Flarum\Discussion\Discussion;
use GuzzleHttp\Client as GuzzleClient;
use Illuminate\Support\Carbon;
use Psr\Log\NullLogger;
use Stezkoy\Feed2forum\Models\Feed;
use Stezkoy\Feed2forum\Models\Item;

class FeedFetcher
{
    private ?FeedIo $feedIoInstance = null;

    public function __construct(
        protected WorkLog $log
    ) {
    }

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

        // guid => payload. When an article is served twice in one response,
        // the later payload wins so it is imported only once.
        $payloadByGuid = [];

        foreach ($result->getFeed() as $entry) {
            $payloadByGuid[$this->entryGuid($entry)] = [
                'title' => mb_substr(trim((string) $entry->getTitle()), 0, 255),
                'link' => trim((string) $entry->getLink()),
                'content' => $this->entryContent($entry),
                'published_at' => $entry->getLastModified() ?: Carbon::now(),
            ];
        }

        $guids = array_keys($payloadByGuid);

        // Fetch the known rows in one query, then compare in memory so that
        // unchanged articles produce no UPDATE statements at all.
        $known = Item::query()
            ->where('feed_id', $feed->id)
            ->whereIn('guid', $guids)
            ->get(['id', 'guid', 'title', 'link', 'content', 'published_at'])
            ->keyBy('guid');

        $newGuids = [];
        $changedById = [];

        foreach ($payloadByGuid as $guid => $payload) {
            $row = $known->get($guid);

            if ($row === null) {
                $newGuids[] = $guid;

                continue;
            }

            if ($this->hasChanges($row, $payload)) {
                $changedById[$row->id] = $payload;
            }
        }

        if ($changedById !== []) {
            $this->bulkUpdate(array_keys($changedById), $changedById);
        }

        $newItems = [];

        if ($newGuids !== []) {
            $this->bulkInsert($feed, $payloadByGuid, $newGuids);

            $newItems = Item::query()
                ->where('feed_id', $feed->id)
                ->whereIn('guid', $newGuids)
                ->orderBy('id')
                ->get()
                ->all();
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

        // Note the parentheses: without them `??` binds looser than `<=>`,
        // turning the comparator into a raw timestamp and breaking the sort.
        usort(
            $items,
            fn (Item $a, Item $b): int => ($b->published_at?->timestamp ?? 0) <=> ($a->published_at?->timestamp ?? 0)
        );

        $kept = array_slice($items, 0, $limit);

        $skipped = array_slice($items, $limit);

        foreach ($skipped as $item) {
            $item->status = 'skipped';
            $item->save();
        }

        $this->log->info(
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

    /**
     * Shared FeedIo/HTTP-client instance so fetches reuse the connection
     * instead of allocating a fresh client per call.
     */
    public function feedIo(): FeedIo
    {
        return $this->feedIoInstance ??= new FeedIo(
            new FeedIoHttpClient(new GuzzleClient([
                'timeout' => 15,
                'connect_timeout' => 8,
            ])),
            new NullLogger()
        );
    }

    private function hasChanges(Item $row, array $payload): bool
    {
        $payloadTimestamp = $payload['published_at'] ? $payload['published_at']->getTimestamp() : null;
        $rowTimestamp = $row->published_at ? $row->published_at->getTimestamp() : null;

        return (string) $row->title !== (string) $payload['title']
            || (string) $row->link !== (string) $payload['link']
            || (string) $row->content !== (string) $payload['content']
            || $rowTimestamp !== $payloadTimestamp;
    }

    /**
     * Insert the payloads for previously unknown GUIDs in a single statement.
     */
    private function bulkInsert(Feed $feed, array $payloadByGuid, array $guids): void
    {
        $now = Carbon::now();

        $rows = [];

        foreach ($guids as $guid) {
            $rows[] = array_merge($payloadByGuid[$guid], [
                'feed_id' => $feed->id,
                'guid' => $guid,
                'status' => 'pending',
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }

        Item::query()->getConnection()->table('feed2forum_items')->insert($rows);
    }

    /**
     * Update the changed fields of the given items in a single statement.
     *
     * @phpstan-param array<int, array{title: string, link: string, content: string, published_at: \DateTimeInterface|\Illuminate\Support\Carbon}> $payloadsById
     */
    private function bulkUpdate(array $ids, array $payloadsById): void
    {
        $connection = Item::query()->getConnection();

        $case = function (string $column, callable $extract) use ($connection, $payloadsById): string {
            $parts = '';

            foreach ($payloadsById as $id => $payload) {
                $parts .= ' WHEN '.((int) $id).' THEN '.$connection->getPdo()->quote((string) $extract($payload));
            }

            return 'CASE '.$column.$parts.' END';
        };

        $connection->table('feed2forum_items')
            ->whereIn('id', $ids)
            ->update([
                'title' => $connection->raw($case('id', fn ($payload) => $payload['title'])),
                'link' => $connection->raw($case('id', fn ($payload) => $payload['link'])),
                'content' => $connection->raw($case('id', fn ($payload) => $payload['content'])),
                'published_at' => $connection->raw($case('id', fn ($payload) => $payload['published_at']?->format('Y-m-d H:i:s'))),
                'updated_at' => Carbon::now(),
            ]);
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