<?php

namespace Stezkoy\Feed2forum\Job;

use Flarum\Queue\AbstractJob;
use Psr\Log\LoggerInterface;
use Stezkoy\Feed2forum\Models\Item;
use Stezkoy\Feed2forum\Support\ItemPublisher;

class PublishItemJob extends AbstractJob
{
    public function __construct(public Item $item)
    {
    }

    public function handle(ItemPublisher $publisher, LoggerInterface $logger): void
    {
        try {
            $publisher->publish($this->item);
        } catch (\Throwable $e) {
            $logger->error('[Feed2Forum] Failed to publish item '.$this->item->id.': '.$e->getMessage());
        }
    }
}