<?php

namespace Stezkoy\Feed2forum\Job;

use Flarum\Queue\AbstractJob;
use Psr\Log\LoggerInterface;
use Stezkoy\Feed2forum\Models\Item;
use Stezkoy\Feed2forum\Support\ItemPublisher;
use Stezkoy\Feed2forum\Support\WorkLog;

class PublishItemJob extends AbstractJob
{
    public function __construct(public Item $item)
    {
    }

    public function handle(ItemPublisher $publisher, LoggerInterface $logger): void
    {
        try {
            $discussion = $publisher->publish($this->item);

            WorkLog::info('Published "'.$this->item->title.'" as discussion #'.$discussion->id.'.', $this->item->feed_id);
        } catch (\Throwable $e) {
            $logger->error('[Feed2Forum] Failed to publish item '.$this->item->id.': '.$e::class.': '.$e->getMessage());
            WorkLog::error('Failed to publish "'.$this->item->title.'": '.$e->getMessage(), $this->item->feed_id);
        }
    }
}