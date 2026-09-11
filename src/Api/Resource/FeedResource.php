<?php

namespace Stezkoy\Feed2forum\Api\Resource;

use Flarum\Api\Context as FlarumContext;
use Flarum\Api\Endpoint;
use Flarum\Api\Resource\AbstractDatabaseResource;
use Flarum\Api\Schema;
use Flarum\Foundation\ValidationException;
use Illuminate\Contracts\Queue\Queue;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Str;
use Stezkoy\Feed2forum\Job\FetchFeedJob;
use Stezkoy\Feed2forum\Models\Feed;
use Stezkoy\Feed2forum\Support\FeedFetcher;
use Tobyz\JsonApiServer\Context;

class FeedResource extends AbstractDatabaseResource
{
    public function __construct(
        protected Queue $queue,
        protected FeedFetcher $fetcher
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
            ->with('tag')
            ->orderByDesc('created_at');
    }

    public function endpoints(): array
    {
        return [
            Endpoint\Show::make()
                ->admin()
                ->defaultInclude(['tag'])
                ->eagerLoad(['tag']),
            Endpoint\Create::make()
                ->admin()
                ->defaultInclude(['tag'])
                ->eagerLoad(['tag']),
            Endpoint\Update::make()
                ->admin()
                ->defaultInclude(['tag'])
                ->eagerLoad(['tag']),
            Endpoint\Delete::make()
                ->admin(),
            Endpoint\Index::make()
                ->admin()
                ->defaultInclude(['tag'])
                ->eagerLoad(['tag']),
            Endpoint\Endpoint::make('preview')
                ->route('GET', '/{id}/preview')
                ->admin()
                ->action(fn (FlarumContext $context): array => $this->preview($context)),
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
            Schema\DateTime::make('created_at'),
            Schema\Relationship\ToOne::make('tag')
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
                    'excerpt' => $this->plainText((string) $content, 180),
                ];

                if (count($items) >= 20) {
                    break;
                }
            }
        } catch (\Throwable $e) {
            throw new ValidationException([
                'url' => $e->getMessage(),
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

    private function plainText(string $content, int $limit): string
    {
        $text = trim(html_entity_decode(strip_tags($content), ENT_QUOTES | ENT_HTML5, 'UTF-8'));
        $text = preg_replace('/\s+/u', ' ', $text);

        return Str::limit($text, $limit);
    }
}