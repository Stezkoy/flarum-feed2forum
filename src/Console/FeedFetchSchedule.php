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
        // Cron cannot express "every N minutes" for intervals that do not
        // divide 60 (e.g. 43 min -> fires at :00 and :43 with 17-minute gaps).
        // Run every minute instead; FetchFeeds gates on the real interval
        // (last_fetch_at setting) and skips runs that come too early.
        $event->cron('* * * * *');
    }
}