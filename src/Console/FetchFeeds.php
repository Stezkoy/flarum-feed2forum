<?php

namespace Stezkoy\Feed2forum\Console;

use Carbon\Carbon;
use Flarum\Settings\SettingsRepositoryInterface;
use Illuminate\Console\Command;
use Illuminate\Contracts\Queue\Queue;
use Stezkoy\Feed2forum\Job\FetchFeedJob;
use Stezkoy\Feed2forum\Models\Feed;
use Stezkoy\Feed2forum\Support\FeedFetcher;

class FetchFeeds extends Command
{
    protected $signature = 'feed2forum:fetch {url?} {--force}';

    protected $description = 'Dispatch queue jobs to fetch RSS/Atom feeds and publish new items as discussions';

    public function __construct(
        protected Queue $queue,
        protected FeedFetcher $fetcher,
        protected SettingsRepositoryInterface $settings
    ) {
        parent::__construct();
    }

    public function handle(): int
    {
        $url = $this->argument('url');

        if ($url) {
            $this->inspectUrl((string) $url);

            return 0;
        }

        // Cron cannot express "every N minutes" for intervals that do not
        // divide 60 (e.g. 43 min), so the schedule runs every minute and this
        // gate enforces the real interval. Manual runs (--force, admin buttons)
        // bypass it.
        if (! $this->option('force') && ! $this->intervalElapsed()) {
            return 0;
        }

        $feeds = Feed::where('status', 'active')->get();

        if ($feeds->isEmpty()) {
            $this->info('No active feeds found.');

            return 0;
        }

        foreach ($feeds as $feed) {
            $this->queue->push(new FetchFeedJob($feed));
            $this->info("Queued fetch for feed: {$feed->title} ({$feed->url})");
        }

        $this->info(sprintf('%d feed fetch job(s) dispatched to the queue.', $feeds->count()));

        return 0;
    }

    private function intervalElapsed(): bool
    {
        $minutes = max(1, (int) $this->settings->get('stezkoy-feed2forum.fetch_interval', 60));

        $last = $this->settings->get('stezkoy-feed2forum.last_fetch_at');

        if ($last !== null && Carbon::parse($last)->addMinutes($minutes)->isFuture()) {
            return false;
        }

        $this->settings->set('stezkoy-feed2forum.last_fetch_at', Carbon::now()->toIso8601String());

        return true;
    }

    protected function inspectUrl(string $url): void
    {
        try {
            $result = $this->fetcher->feedIo()->read($url);

            $this->info('Feed parsed successfully:');

            foreach ($result->getFeed() as $entry) {
                $this->info("  - {$entry->getTitle()}");
            }
        } catch (\Throwable $e) {
            $this->error("Failed to fetch feed {$url}: {$e->getMessage()}");
        }
    }
}