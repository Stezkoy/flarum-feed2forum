<?php

use Flarum\Database\Migration;

return Migration::createTable('feed2forum_logs', function (Illuminate\Database\Schema\Blueprint $table) {
    $table->id();
    $table->unsignedInteger('feed_id')->nullable();
    $table->string('level', 16)->default('info');
    $table->text('message');
    $table->timestamp('created_at')->nullable();

    $table->index('created_at');
});