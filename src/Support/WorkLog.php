<?php

namespace Stezkoy\Feed2forum\Support;

use Carbon\Carbon;
use Stezkoy\Feed2forum\Models\LogEntry;

/**
 * Work log for the admin panel. Bound as a singleton in the container and
 * injected into the classes that report events, so the logging backend can be
 * swapped or mocked in tests.
 */
class WorkLog
{
    /**
     * Hard cap on stored rows: every insert prunes the table down to this
     * size, so the log can never grow unbounded on the server.
     */
    public const MAX_ROWS = 500;

    public function add(string $level, string $message, ?int $feedId = null): void
    {
        try {
            LogEntry::query()->create([
                'feed_id' => $feedId,
                'level' => $level === 'error' ? 'error' : 'info',
                'message' => mb_substr($message, 0, 2000),
                'created_at' => Carbon::now(),
            ]);

            $this->prune();
        } catch (\Throwable) {
            // Logging must never break fetching or publishing.
        }
    }

    public function info(string $message, ?int $feedId = null): void
    {
        $this->add('info', $message, $feedId);
    }

    public function error(string $message, ?int $feedId = null): void
    {
        $this->add('error', $message, $feedId);
    }

    private function prune(): void
    {
        $minId = LogEntry::query()
            ->orderByDesc('id')
            ->skip(self::MAX_ROWS)
            ->limit(1)
            ->value('id');

        if ($minId) {
            LogEntry::query()->where('id', '<', $minId)->delete();
        }
    }
}