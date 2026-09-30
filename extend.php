<?php

namespace Stezkoy\Feed2forum;

use Flarum\Extend;
use Flarum\Search\Database\DatabaseSearchDriver;
use Stezkoy\Feed2forum\Api\Resource\FeedResource;
use Stezkoy\Feed2forum\Api\Resource\ItemResource;
use Stezkoy\Feed2forum\Api\Resource\LogResource;
use Stezkoy\Feed2forum\Console\FetchFeeds;
use Stezkoy\Feed2forum\Console\FeedFetchSchedule;
use Stezkoy\Feed2forum\Models\Item;
use Stezkoy\Feed2forum\Provider\WorkLogServiceProvider;
use Stezkoy\Feed2forum\Search\Filter\StatusFilter;
use Stezkoy\Feed2forum\Search\ItemSearcher;

return [
    (new Extend\Frontend('admin'))
        ->js(__DIR__ . '/js/dist/admin.js')
        ->css(__DIR__ . '/less/admin.less'),

    new Extend\Locales(__DIR__ . '/locale'),

    new Extend\ApiResource(FeedResource::class),
    new Extend\ApiResource(ItemResource::class),
    new Extend\ApiResource(LogResource::class),

    // Required for `filter[status]=pending` on the admin queue endpoint —
    // without a registered searcher the API resource rejects filter params.
    (new Extend\SearchDriver(DatabaseSearchDriver::class))
        ->addSearcher(Item::class, ItemSearcher::class)
        ->addFilter(ItemSearcher::class, StatusFilter::class),

    (new Extend\ServiceProvider())
        ->register(WorkLogServiceProvider::class),

    (new Extend\Settings())
        ->default('stezkoy-feed2forum.author_user_id', '')
        ->default('stezkoy-feed2forum.fetch_interval', 60)
        // Settings are strings end-to-end: a boolean default here reaches the
        // admin payload as JSON true, and String(true) !== '1' rendered the
        // toggles off while the backend treated the setting as on.
        ->default('stezkoy-feed2forum.show_source_link', '1')
        ->default('stezkoy-feed2forum.use_article_date', '1')
        ->default('stezkoy-feed2forum.content_retention_days', 90),

    (new Extend\Console())
        ->command(FetchFeeds::class)
        ->schedule('feed2forum:fetch', FeedFetchSchedule::class),
];