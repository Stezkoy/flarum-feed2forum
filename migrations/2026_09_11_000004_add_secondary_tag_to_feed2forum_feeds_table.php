<?php

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Database\Schema\Builder;

return [
    'up' => function (Builder $schema) {
        $schema->table('feed2forum_feeds', function (Blueprint $table) {
            $table->unsignedInteger('secondary_tag_id')->nullable();
        });

        $schema->table('feed2forum_feeds', function (Blueprint $table) {
            $table->foreign('secondary_tag_id')->references('id')->on('tags')->nullOnDelete();
        });
    },

    'down' => function (Builder $schema) {
        $schema->table('feed2forum_feeds', function (Blueprint $table) {
            $table->dropForeign(['secondary_tag_id']);
        });

        $schema->table('feed2forum_feeds', function (Blueprint $table) {
            $table->dropColumn('secondary_tag_id');
        });
    },
];