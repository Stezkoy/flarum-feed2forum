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
        $minutes = max(1, (int) $this->settings->get('stezkoy-feed2forum.fetch_interval', 60));

        if ($minutes >= 60) {
            $hours = max(1, (int) round($minutes / 60));

            $event->cron('0 */'.$hours.' * * *');

            return;
        }

        $event->cron("*/{$minutes} * * * *");
    }
}