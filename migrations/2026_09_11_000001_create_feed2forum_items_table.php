<?php

use Flarum\Database\Migration;

return Migration::createTable('feed2forum_items', function (Illuminate\Database\Schema\Blueprint $table) {
    $table->id();
    $table->unsignedBigInteger('feed_id');
    $table->string('guid', 512);
    $table->string('title');
    $table->text('content')->nullable();
    $table->string('link')->nullable();
    $table->timestamp('published_at')->nullable();
    $table->string('status')->default('pending');
    $table->unsignedInteger('discussion_id')->nullable();
    $table->timestamps();

    $table->foreign('feed_id')->references('id')->on('feed2forum_feeds')->onDelete('cascade');
    $table->foreign('discussion_id')->references('id')->on('discussions')->nullOnDelete();
    $table->unique(['feed_id', 'guid']);
});