<?php

namespace Stezkoy\Feed2forum\Console;

use Carbon\Carbon;
use Flarum\Settings\SettingsRepositoryInterface;
use Illuminate\Console\Command;
use Illuminate\Contracts\Queue\Queue;
use Stezkoy\Feed2forum\Job\FetchFeedJob;
use Stezkoy\Feed2forum\Models\Feed;
use Stezkoy\Feed2forum\Models\Item;
use Stezkoy\Feed2forum\Support\FeedFetcher;
use Stezkoy\Feed2forum\Support\WorkLog;

class FetchFeeds extends Command
{
    protected $signature = 'feed2forum:fetch {url?} {--force}';

    protected $description = 'Dispatch queue jobs to fetch RSS/Atom feeds and publish new items as discussions';

    public function __construct(
        protected Queue $queue,
        protected FeedFetcher $fetcher,
        protected SettingsRepositoryInterface $settings,
        protected WorkLog $log
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

        $this->pruneContent();

        return 0;
    }

    /**
     * Content compaction: full article text of published and skipped items
     * older than the retention window is dropped. The row skeleton (guid,
     * feed_id, status, content_hash) stays, so deduplication is unaffected —
     * hasChanges() diffs by hash and will never re-import a compacted row.
     */
    private function pruneContent(): void
    {
        $days = max(0, (int) $this->settings->get('stezkoy-feed2forum.content_retention_days', 90));

        if ($days <= 0) {
            return;
        }

        $count = Item::query()
            ->whereIn('status', ['published', 'skipped'])
            ->whereNotNull('content')
            ->where('created_at', '<', Carbon::now()->subDays($days))
            ->update(['content' => null]);

        if ($count > 0) {
            $this->info("Pruned full content of {$count} old item(s) (retention {$days} days).");
            $this->log->info('Pruned full content of '.$count.' old item(s) (retention '.$days.' days).');
        }
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