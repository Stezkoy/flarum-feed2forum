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
        switch ((string) $this->settings->get('stezkoy-feed2forum.fetch_interval', 'hourly')) {
            case 'minutely':
                $event->everyMinute();
                break;
            case 'daily':
                $event->daily();
                break;
            case 'weekly':
                $event->weekly();
                break;
            default:
                $event->hourly();
        }
    }
}