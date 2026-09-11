<?php

namespace Stezkoy\Feed2forum\Job;

use Flarum\Queue\AbstractJob;
use Illuminate\Contracts\Queue\Queue;
use Psr\Log\LoggerInterface;
use Stezkoy\Feed2forum\Models\Feed;
use Stezkoy\Feed2forum\Models\Item;
use Stezkoy\Feed2forum\Support\FeedFetcher;
use Stezkoy\Feed2forum\Support\WorkLog;

class FetchFeedJob extends AbstractJob
{
    public function __construct(public Feed $feed)
    {
    }

    public function handle(
        Queue $queue,
        FeedFetcher $fetcher,
        LoggerInterface $logger
    ): void {
        $reset = $fetcher->resetOrphanedItems();

        if ($reset > 0) {
            $logger->info('[Feed2Forum] Reset '.$reset.' item(s) whose discussions were deleted.');
            WorkLog::info('Restored '.$reset.' item(s) whose discussions were deleted on the forum.', null);
        }

        try {
            $items = $fetcher->fetchFeed($this->feed);
        } catch (\Throwable $e) {
            $logger->error('[Feed2Forum] Failed to fetch feed '.$this->feed->id.': '.$e::class.': '.$e->getMessage());
            WorkLog::error('Fetch failed for "'.$this->feed->title.'": '.$e->getMessage(), $this->feed->id);

            return;
        }

        $logger->info('[Feed2Forum] Feed '.$this->feed->id.': '.count($items).' new item(s).');

        if (count($items) > 0) {
            WorkLog::info('Fetched "'.$this->feed->title.'": '.count($items).' new item(s).', $this->feed->id);
        }

        if ((string) $this->feed->publish_mode !== 'auto') {
            return;
        }

        $pending = Item::query()
            ->where('feed_id', $this->feed->id)
            ->where('status', 'pending')
            // Items restored after their discussion was deleted on the forum
            // wait for manual approval — they are not auto-published.
            ->where('was_deleted', false)
            ->orderByDesc('published_at')
            ->orderByDesc('id')
            ->get();

        if ($pending->isEmpty()) {
            return;
        }

        $limit = max(0, (int) $this->feed->publish_limit);
        $candidates = $limit > 0 ? $pending->take($limit) : $pending;

        foreach ($candidates as $item) {
            $queue->push(new PublishItemJob($item));
        }

        WorkLog::info('Queued '.$candidates->count().' item(s) of "'.$this->feed->title.'" for publishing.', $this->feed->id);
    }
}