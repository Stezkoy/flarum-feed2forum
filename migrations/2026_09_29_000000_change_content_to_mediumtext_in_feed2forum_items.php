<?php

use Flarum\Database\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Database\Schema\Builder;

// RSS full-content articles can exceed MySQL's 65 KB TEXT limit; on a strict
// SQL mode that makes the whole fetch abort with "Data too long", and on a
// non-strict one it silently corrupts the stored article. Widen the column to
// MEDIUMTEXT (16 MB) and keep rows small via a runtime cap in FeedFetcher.
return [
    'up' => function (Builder $schema) {
        $schema->table('feed2forum_items', function (Blueprint $table) {
            $table->mediumText('content')->nullable()->change();
        });
    },
    'down' => function (Builder $schema) {
        $schema->table('feed2forum_items', function (Blueprint $table) {
            $table->text('content')->nullable()->change();
        });
    },
];
