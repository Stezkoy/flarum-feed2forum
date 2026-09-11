<?php

namespace Stezkoy\Feed2forum\Job;

use Flarum\Queue\AbstractJob;
use Flarum\Settings\SettingsRepositoryInterface;
use Illuminate\Contracts\Queue\Queue;
use Psr\Log\LoggerInterface;
use Stezkoy\Feed2forum\Models\Feed;
use Stezkoy\Feed2forum\Models\Item;
use Stezkoy\Feed2forum\Support\FeedFetcher;

class FetchFeedJob extends AbstractJob
{
    public function __construct(public Feed $feed)
    {
    }

    public function handle(
        Queue $queue,
        FeedFetcher $fetcher,
        SettingsRepositoryInterface $settings,
        LoggerInterface $logger
    ): void {
        try {
            $items = $fetcher->fetchFeed($this->feed);
        } catch (\Throwable $e) {
            $logger->error('[Feed2Forum] Failed to fetch feed '.$this->feed->id.': '.$e->getMessage());

            return;
        }

        if ($items === []) {
            return;
        }

        $logger->info('[Feed2Forum] Feed '.$this->feed->id.': '.count($items).' new item(s).');

        if ((string) $settings->get('stezkoy-feed2forum.publish_mode', 'auto') !== 'auto') {
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