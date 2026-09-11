<?php

namespace Stezkoy\Feed2forum\Console;

use FeedIo\Adapter\Http\Client as FeedIoHttpClient;
use FeedIo\FeedIo;
use GuzzleHttp\Client as GuzzleClient;
use Illuminate\Console\Command;
use Illuminate\Contracts\Queue\Queue;
use Psr\Log\NullLogger;
use Stezkoy\Feed2forum\Job\FetchFeedJob;
use Stezkoy\Feed2forum\Models\Feed;

class FetchFeeds extends Command
{
    protected $signature = 'feed2forum:fetch {url?}';

    protected $description = 'Dispatch queue jobs to fetch RSS/Atom feeds and publish new items as discussions';

    public function __construct(
        protected Queue $queue
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

    protected function inspectUrl(string $url): void
    {
        try {
            $result = $this->feedIo()->read($url);

            $this->info('Feed parsed successfully:');

            foreach ($result->getFeed() as $entry) {
                $this->info("  - {$entry->getTitle()}");
            }
        } catch (\Throwable $e) {
            $this->error("Failed to fetch feed {$url}: {$e->getMessage()}");
        }
    }

    protected function feedIo(): FeedIo
    {
        $guzzle = new GuzzleClient([
            'timeout' => 15,
            'connect_timeout' => 8,
        ]);

        return new FeedIo(
            new FeedIoHttpClient($guzzle),
            new NullLogger()
        );
    }
}