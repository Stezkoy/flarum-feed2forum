<?php

use Flarum\Database\Migration;

return Migration::addColumns('feed2forum_feeds', [
    'publish_mode' => ['string', 'length' => 32, 'default' => 'queue'],
]);