<?php

use Flarum\Database\Migration;

return Migration::alter('feed2forum_feeds', function (Illuminate\Database\Schema\Blueprint $table) {
    $table->string('publish_mode')->default('queue');
});