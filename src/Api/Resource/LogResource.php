<?php

namespace Stezkoy\Feed2forum\Api\Resource;

use Flarum\Api\Endpoint;
use Flarum\Api\Resource\AbstractDatabaseResource;
use Flarum\Api\Schema;
use Illuminate\Database\Eloquent\Builder;
use Stezkoy\Feed2forum\Models\LogEntry;
use Tobyz\JsonApiServer\Context;

class LogResource extends AbstractDatabaseResource
{
    public function type(): string
    {
        return 'feed2forum-logs';
    }

    public function model(): string
    {
        return LogEntry::class;
    }

    public function scope(Builder $query, Context $context): void
    {
        $query->orderByDesc('id');
    }

    public function endpoints(): array
    {
        return [
            Endpoint\Index::make()
                ->admin()
                ->paginate(50, 200),
            Endpoint\Endpoint::make('clearLog')
                ->route('POST', '/clear')
                ->admin()
                ->action(function (): array {
                    LogEntry::query()->truncate();

                    return ['data' => ['type' => 'feed2forum-logs', 'id' => 'cleared']];
                }),
        ];
    }

    public function fields(): array
    {
        return [
            Schema\Integer::make('feed_id'),
            Schema\Str::make('level'),
            Schema\Str::make('message'),
            Schema\DateTime::make('created_at'),
        ];
    }
}