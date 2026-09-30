<?php

namespace Stezkoy\Feed2forum\Job;

use Flarum\Queue\AbstractJob;
use Illuminate\Contracts\Queue\Queue;
use Illuminate\Support\Carbon;
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
        LoggerInterface $logger,
        WorkLog $log
    ): void {
        $reset = $fetcher->resetOrphanedItems($this->feed);

        if ($reset > 0) {
            $log->info('Restored '.$reset.' item(s) of "'.$this->feed->title.'" whose discussions were deleted on the forum.', $this->feed->id);
        }

        try {
            $items = $fetcher->fetchFeed($this->feed);
        } catch (\Throwable $e) {
            $logger->error('[Feed2Forum] Failed to fetch feed '.$this->feed->id.': '.$e::class.': '.$e->getMessage());
            $log->error('Fetch failed for "'.$this->feed->title.'": '.$e->getMessage(), $this->feed->id);

            return;
        }

        $log->info(
            'Checked "'.$this->feed->title.'": '.(count($items) > 0 ? count($items).' new item(s).' : 'no new items.'),
            $this->feed->id
        );

        if ((string) $this->feed->publish_mode !== 'auto') {
            return;
        }

        // Publish jobs that were dispatched but never ran (lost worker) are
        // claimable again after a grace period — self-healing without
        // re-dispatching jobs that are still waiting in the queue.
        Item::query()
            ->where('feed_id', $this->feed->id)
            ->where('status', 'queued')
            ->where('updated_at', '<', Carbon::now()->subHours(2))
            ->update(['status' => 'pending']);

        $limit = max(0, (int) $this->feed->publish_limit);

        $claimQuery = Item::query()
            ->where('feed_id', $this->feed->id)
            ->where('status', 'pending')
            // Items restored after their discussion was deleted on the forum
            // wait for manual approval — they are not auto-published.
            ->where('was_deleted', false)
            ->orderByDesc('published_at')
            ->orderByDesc('id');

        if ($limit > 0) {
            $claimQuery->limit($limit);
        }

        $ids = $claimQuery->pluck('id')->all();

        if ($ids === []) {
            return;
        }

        // Atomically claim the items: only rows still pending flip to queued,
        // so a slow queue worker never accumulates duplicate publish jobs for
        // the same backlog on every fetch cycle.
        $claimed = Item::query()
            ->whereIn('id', $ids)
            ->where('status', 'pending')
            ->update(['status' => 'queued']);

        if (! $claimed) {
            return;
        }

        $queued = Item::query()
            ->whereIn('id', $ids)
            ->where('status', 'queued')
            ->pluck('id');

        foreach ($queued as $id) {
            $queue->push(new PublishItemJob(Item::query()->findOrFail($id)));
        }

        $log->info('Queued '.$claimed.' item(s) of "'.$this->feed->title.'" for publishing.', $this->feed->id);
    }
}