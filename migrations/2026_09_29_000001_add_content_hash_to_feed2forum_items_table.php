<?php

use Flarum\Database\Migration;

// Stored MD5 of the raw article HTML. Lets the fetcher diff feeds by hash
// instead of loading full content strings into memory (see FeedFetcher).
return Migration::addColumns('feed2forum_items', [
    'content_hash' => ['string', 'length' => 32, 'nullable' => true],
]);
