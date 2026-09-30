<?php

namespace Stezkoy\Feed2forum\Api\Resource;

use Flarum\Api\Context as FlarumContext;
use Flarum\Api\Endpoint;
use Flarum\Api\Resource\AbstractDatabaseResource;
use Flarum\Api\Schema;
use Flarum\Foundation\ValidationException;
use Illuminate\Contracts\Queue\Queue;
use Illuminate\Contracts\Translation\Translator;
use Illuminate\Database\Eloquent\Builder;
use Psr\Log\LoggerInterface;
use Stezkoy\Feed2forum\Job\FetchFeedJob;
use Stezkoy\Feed2forum\Models\Feed;
use Stezkoy\Feed2forum\Models\Item;
use Stezkoy\Feed2forum\Support\FeedFetcher;
use Stezkoy\Feed2forum\Support\Text;
use Stezkoy\Feed2forum\Support\WorkLog;
use Tobyz\JsonApiServer\Context;

class FeedResource extends AbstractDatabaseResource
{
    public function __construct(
        protected Queue $queue,
        protected FeedFetcher $fetcher,
        protected LoggerInterface $logger,
        protected Translator $translator,
        protected WorkLog $log
    ) {
    }

    public function type(): string
    {
        return 'feed2forum-feeds';
    }

    public function model(): string
    {
        return Feed::class;
    }

    public function scope(Builder $query, Context $context): void
    {
        $query
            ->with(['tag', 'secondaryTag'])
            // How many items this feed has parked as 'skipped' (publish-limit
            // overflow) — powers the per-feed "Restore skipped" action.
            ->withCount(['items as skipped_items_count' => fn (Builder $query) => $query->where('status', 'skipped')])
            ->orderByDesc('created_at');
    }

    public function endpoints(): array
    {
        return [
            Endpoint\Show::make()
                ->admin()
                ->defaultInclude(['tag', 'secondaryTag'])
                ->eagerLoad(['tag', 'secondaryTag']),
            Endpoint\Create::make()
                ->admin()
                ->defaultInclude(['tag', 'secondaryTag'])
                ->eagerLoad(['tag', 'secondaryTag']),
            Endpoint\Update::make()
                ->admin()
                ->defaultInclude(['tag', 'secondaryTag'])
                ->eagerLoad(['tag', 'secondaryTag']),
            Endpoint\Delete::make()
                ->admin(),
            Endpoint\Index::make()
                ->admin()
                ->defaultInclude(['tag', 'secondaryTag'])
                ->eagerLoad(['tag', 'secondaryTag']),
            Endpoint\Endpoint::make('preview')
                ->route('GET', '/{id}/preview')
                ->admin()
                ->action(fn (FlarumContext $context): array => $this->preview($context)),
            Endpoint\Endpoint::make('restoreSkipped')
                ->route('POST', '/{id}/restore-skipped')
                ->admin()
                ->action(function (FlarumContext $context): array {
                    $feed = $context->model;

                    // Flipped back to pending: the rows stay known for dedup,
                    // so the feed will never import them twice. Restored
                    // items keep their was_deleted flag and, in auto mode,
                    // will be published on the next fetch (within the limit).
                    $restored = Item::query()
                        ->where('feed_id', $feed->id)
                        ->where('status', 'skipped')
                        ->update(['status' => 'pending']);

                    $this->log->info('Restored '.$restored.' skipped item(s) of "'.$feed->title.'" to the queue.', $feed->id);

                    return [
                        'data' => ['type' => 'feed2forum-feeds', 'id' => (string) $feed->id],
                        'meta' => ['restored' => $restored],
                    ];
                }),
            Endpoint\Endpoint::make('fetch')
                ->route('POST', '/{id}/fetch')
                ->admin()
                ->action(function (FlarumContext $context): array {
                    $this->queue->push(new FetchFeedJob($context->model));

                    return ['data' => ['type' => 'feed2forum-feeds', 'id' => (string) $context->model->id]];
                }),
            Endpoint\Endpoint::make('fetchAll')
                ->route('POST', '/fetch-all')
                ->admin()
                ->action(function (): array {
                    foreach (Feed::where('status', 'active')->get() as $feed) {
                        $this->queue->push(new FetchFeedJob($feed));
                    }

                    return ['data' => ['type' => 'feed2forum-feeds', 'id' => 'all']];
                }),
        ];
    }

    public function fields(): array
    {
        return [
            Schema\Str::make('title')
                ->requiredOnCreate()
                ->maxLength(255)
                ->writable(),
            Schema\Str::make('url')
                ->requiredOnCreate()
                ->maxLength(2048)
                ->rule('url')
                ->writable(),
            Schema\Integer::make('tag_id')
                ->nullable()
                ->rule('exists:tags,id')
                ->writable(),
            Schema\Integer::make('secondary_tag_id')
                ->nullable()
                ->rule('exists:tags,id')
                ->writable(),
            Schema\Integer::make('publish_limit')
                ->nullable()
                ->min(0)
                ->default(5)
                ->writable(),
            Schema\Str::make('publish_mode')
                ->default('queue')
                ->in(['queue', 'auto'])
                ->writable(),
            Schema\Str::make('status')
                ->default('active')
                ->in(['active', 'paused'])
                ->writable(),
            Schema\Integer::make('skipped_count')
                ->visible(fn (Feed $feed, FlarumContext $context) => ! $context->creating())
                ->get(fn (Feed $feed) => (int) ($feed->skipped_items_count ?? 0)),
            Schema\DateTime::make('created_at'),
            Schema\Relationship\ToOne::make('tag')
                ->type('tags')
                ->includable(),
            Schema\Relationship\ToOne::make('secondaryTag')
                ->type('tags')
                ->includable(),
        ];
    }

    private function preview(FlarumContext $context): array
    {
        $feed = $context->model;

        try {
            $result = $this->fetcher->feedIo()->read($feed->url);
            $items = [];

            foreach ($result->getFeed() as $item) {
                $content = $item->getValue('content:encoded') ?: $item->getContent();
                $publishedAt = $item->getLastModified();

                $items[] = [
                    'title' => (string) $item->getTitle(),
                    'link' => (string) $item->getLink(),
                    'published_at' => $publishedAt instanceof \DateTimeInterface ? $publishedAt->format(DATE_ATOM) : null,
                    'excerpt' => Text::plainText((string) $content, 180),
                ];

                if (count($items) >= 20) {
                    break;
                }
            }
        } catch (\Throwable $e) {
            // The full exception may contain network internals (cURL errors,
            // resolved hosts) — it goes to the system log only. The admin gets
            // a safe message plus the HTTP status when one is available.
            $this->logger->error('[Feed2Forum] Preview failed for feed '.$feed->id.' ('.$feed->url.'): '.$e::class.': '.$e->getMessage());

            $statusCode = null;

            if (method_exists($e, 'getResponse') && ($response = $e->getResponse()) !== null) {
                $statusCode = $response->getStatusCode();
            }

            throw new ValidationException([
                'url' => $this->translator->trans('stezkoy-feed2forum.admin.preview_fetch_failed')
                    .($statusCode !== null ? ' (HTTP '.$statusCode.')' : ''),
            ]);
        }

        return [
            'data' => [
                'type' => 'feed2forum-feed-previews',
                'id' => (string) $feed->id,
                'attributes' => [
                    'title' => $feed->title,
                    'url' => $feed->url,
                    'items' => $items,
                ],
            ],
        ];
    }
}