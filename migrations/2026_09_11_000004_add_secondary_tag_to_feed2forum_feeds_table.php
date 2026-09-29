<?php

use Flarum\Database\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Database\Schema\Builder;

// The column itself is defined with the helper; Migration::addColumns returns
// the same ['up' => Closure, 'down' => Closure] shape as a raw array, so we
// layer the foreign key on top of the helper's closures. Merge FK handling
// with the column so the final effect matches a single hand-written migration.
$migration = Migration::addColumns('feed2forum_feeds', [
    'secondary_tag_id' => ['unsignedInteger', 'nullable' => true],
]);

$migration['up'] = function (Builder $schema) use ($migration) {
    $migration['up']($schema);

    $schema->table('feed2forum_feeds', function (Blueprint $table) {
        $table->foreign('secondary_tag_id')->references('id')->on('tags')->nullOnDelete();
    });
};

$migration['down'] = function (Builder $schema) use ($migration) {
    $schema->table('feed2forum_feeds', function (Blueprint $table) {
        $table->dropForeign(['secondary_tag_id']);
    });

    $migration['down']($schema);
};

return $migration;