<?php

namespace Stezkoy\Feed2forum\Api\Resource;

use Flarum\Api\Context as FlarumContext;
use Flarum\Api\Endpoint;
use Flarum\Api\Resource\AbstractDatabaseResource;
use Flarum\Api\Schema;
use Flarum\Http\RequestUtil;
use Illuminate\Database\Eloquent\Builder;
use Stezkoy\Feed2forum\Models\Item;
use Stezkoy\Feed2forum\Support\ItemPublisher;
use Stezkoy\Feed2forum\Support\WorkLog;
use Tobyz\JsonApiServer\Context;

class ItemResource extends AbstractDatabaseResource
{
    public function __construct(
        protected ItemPublisher $publisher
    ) {
    }

    public function type(): string
    {
        return 'feed2forum-items';
    }

    public function model(): string
    {
        return Item::class;
    }

    public function scope(Builder $query, Context $context): void
    {
        $query
            ->with(['feed', 'discussion'])
            ->orderByDesc('published_at')
            ->orderByDesc('id');

        $status = RequestUtil::extractFilter($context->request)['status'] ?? null;

        if (in_array($status, ['pending', 'published'], true)) {
            $query->where('status', $status);
        }
    }

    public function endpoints(): array
    {
        return [
            Endpoint\Show::make()
                ->admin()
                ->defaultInclude(['feed', 'discussion'])
                ->eagerLoad(['feed', 'discussion']),
            Endpoint\Index::make()
                ->admin()
                ->paginate(20, 100)
                ->defaultInclude(['feed'])
                ->eagerLoad(['feed']),
            Endpoint\Delete::make()
                ->admin(),
            Endpoint\Endpoint::make('publish')
                ->route('POST', '/{id}/publish')
                ->admin()
                ->action(fn (FlarumContext $context) => $this->publish($context)),
            Endpoint\Endpoint::make('clearQueue')
                ->route('POST', '/clear')
                ->admin()
                ->action(function (): array {
                    Item::query()->where('status', 'pending')->delete();

                    return ['data' => ['type' => 'feed2forum-items', 'id' => 'cleared']];
                }),
        ];
    }

    public function fields(): array
    {
        return [
            Schema\Str::make('title'),
            Schema\Str::make('link'),
            Schema\Str::make('published_at')
                ->get(fn (Item $item) => $item->published_at?->toIso8601String()),
            Schema\Str::make('status')
                ->in(['pending', 'published', 'skipped']),
            Schema\Boolean::make('was_deleted'),
            Schema\Integer::make('discussion_id'),
            Schema\DateTime::make('created_at'),
            Schema\Relationship\ToOne::make('feed')
                ->type('feed2forum-feeds')
                ->includable(),
        ];
    }

    private function publish(FlarumContext $context)
    {
        $item = $context->model;

        try {
            $discussion = $this->publisher->publish($item);

            WorkLog::info('Published "'.$item->title.'" as discussion #'.$discussion->id.' (manual).', $item->feed_id);
        } catch (\Throwable $e) {
            WorkLog::error('Failed to publish "'.$item->title.'": '.$e->getMessage(), $item->feed_id);

            throw $e;
        }

        return $item->refresh();
    }
}