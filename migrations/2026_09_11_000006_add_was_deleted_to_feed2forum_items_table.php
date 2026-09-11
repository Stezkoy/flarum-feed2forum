<?php

use Flarum\Database\Migration;

return Migration::addColumns('feed2forum_items', [
    'was_deleted' => ['boolean', 'default' => 0],
]);