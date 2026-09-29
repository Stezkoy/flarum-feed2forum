<?php

namespace Stezkoy\Feed2forum\Api\Resource;

use Flarum\Api\Context as FlarumContext;
use Flarum\Api\Endpoint;
use Flarum\Api\Resource\AbstractDatabaseResource;
use Flarum\Api\Schema;
use Illuminate\Database\Eloquent\Builder;
use Stezkoy\Feed2forum\Models\Item;
use Stezkoy\Feed2forum\Support\ItemPublisher;
use Stezkoy\Feed2forum\Support\WorkLog;
use Tobyz\JsonApiServer\Context;

class ItemResource extends AbstractDatabaseResource
{
    public function __construct(
        protected ItemPublisher $publisher,
        protected WorkLog $log
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
            ->with(['feed'])
            ->orderByDesc('published_at')
            ->orderByDesc('id');

        // filter[status] is applied by the StatusFilter registered in
        // extend.php (via the ItemSearcher), not here — when a model has a
        // registered searcher, the Index endpoint runs that searcher's query
        // instead of this scoped one, so manual extraction here would settle
        // on the non-searcher path only.
    }

    public function endpoints(): array
    {
        return [
            Endpoint\Show::make()
                ->admin()
                ->defaultInclude(['feed'])
                ->eagerLoad(['feed']),
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
                    // Mark as skipped instead of deleting: the rows stay as
                    // dedup tombstones so fetches never re-import them.
                    Item::query()->where('status', 'pending')->update(['status' => 'skipped']);

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

    public function delete(object $model, Context $context): void
    {
        // Mark as skipped instead of deleting: the row stays as a dedup
        // tombstone so the item is never re-imported on the next fetch.
        $model->status = 'skipped';
        $model->save();
    }

    private function publish(FlarumContext $context)
    {
        $item = $context->model;

        try {
            $discussion = $this->publisher->publish($item);

            $this->log->info('Published "'.$item->title.'" as discussion #'.$discussion->id.' (manual).', $item->feed_id);
        } catch (\Throwable $e) {
            $this->log->error('Failed to publish "'.$item->title.'": '.$e->getMessage(), $item->feed_id);

            throw $e;
        }

        return $item->refresh();
    }
}