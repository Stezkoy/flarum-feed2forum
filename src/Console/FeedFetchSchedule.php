<?php

namespace Stezkoy\Feed2forum\Console;

use Flarum\Settings\SettingsRepositoryInterface;
use Illuminate\Console\Scheduling\Event;

class FeedFetchSchedule
{
    public function __construct(
        protected SettingsRepositoryInterface $settings
    ) {
    }

    public function __invoke(Event $event): void
    {
        $minutes = (int) $this->settings->get('stezkoy-feed2forum.fetch_interval', 60);

        if ($minutes < 1) {
            $minutes = 60;
        }

        $event->everyMinutes($minutes);
    }
}