<?php

namespace Stezkoy\Feed2forum;

use Flarum\Extend;
use Flarum\Search\Database\DatabaseSearchDriver;
use Stezkoy\Feed2forum\Api\Resource\FeedResource;
use Stezkoy\Feed2forum\Api\Resource\ItemResource;
use Stezkoy\Feed2forum\Console\FetchFeeds;
use Stezkoy\Feed2forum\Console\FeedFetchSchedule;
use Stezkoy\Feed2forum\Models\Item;
use Stezkoy\Feed2forum\Search\Filter\StatusFilter;
use Stezkoy\Feed2forum\Search\ItemSearcher;

return [
    (new Extend\Frontend('admin'))
        ->js(__DIR__ . '/js/dist/admin.js')
        ->css(__DIR__ . '/less/admin.less'),

    new Extend\Locales(__DIR__ . '/locale'),

    new Extend\ApiResource(FeedResource::class),
    new Extend\ApiResource(ItemResource::class),

    (new Extend\SearchDriver(DatabaseSearchDriver::class))
        ->addSearcher(Item::class, ItemSearcher::class)
        ->addFilter(ItemSearcher::class, StatusFilter::class),

    (new Extend\Settings())
        ->default('stezkoy-feed2forum.author_user_id', '')
        ->default('stezkoy-feed2forum.fetch_interval', 60)
        ->default('stezkoy-feed2forum.show_source_link', true),

    (new Extend\Console())
        ->command(FetchFeeds::class)
        ->schedule('feed2forum:fetch', FeedFetchSchedule::class),
];