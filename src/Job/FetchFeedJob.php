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
        try {
            $items = $fetcher->fetchFeed($this->feed);
        } catch (\Throwable $e) {
            $logger->error('[Feed2Forum] Failed to fetch feed '.$this->feed->id.': '.$e::class.': '.$e->getMessage());
            WorkLog::error('Fetch failed for "'.$this->feed->title.'": '.$e->getMessage(), $this->feed->id);

            return;
        }

        if ($items === []) {
            return;
        }

        $logger->info('[Feed2Forum] Feed '.$this->feed->id.': '.count($items).' new item(s).');
        WorkLog::info('Fetched "'.$this->feed->title.'": '.count($items).' new item(s).', $this->feed->id);

        if ((string) $this->feed->publish_mode !== 'auto') {
            return;
        }

        usort(
            $items,
            fn (Item $a, Item $b): int => $b->published_at?->timestamp ?? 0 <=> $a->published_at?->timestamp ?? 0
        );

        $limit = max(0, (int) $this->feed->publish_limit);
        $candidates = $limit > 0 ? array_slice($items, 0, $limit) : $items;

        foreach ($candidates as $item) {
            $queue->push(new PublishItemJob($item));
        }
    }
}