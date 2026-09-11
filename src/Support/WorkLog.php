<?php

namespace Stezkoy\Feed2forum\Support;

use Carbon\Carbon;
use Stezkoy\Feed2forum\Models\LogEntry;

class WorkLog
{
    /**
     * Hard cap on stored rows: every insert prunes the table down to this
     * size, so the log can never grow unbounded on the server.
     */
    public const MAX_ROWS = 500;

    public static function add(string $level, string $message, ?int $feedId = null): void
    {
        try {
            LogEntry::query()->create([
                'feed_id' => $feedId,
                'level' => $level === 'error' ? 'error' : 'info',
                'message' => mb_substr($message, 0, 2000),
                'created_at' => Carbon::now(),
            ]);

            self::prune();
        } catch (\Throwable) {
            // Logging must never break fetching or publishing.
        }
    }

    public static function info(string $message, ?int $feedId = null): void
    {
        self::add('info', $message, $feedId);
    }

    public static function error(string $message, ?int $feedId = null): void
    {
        self::add('error', $message, $feedId);
    }

    private static function prune(): void
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