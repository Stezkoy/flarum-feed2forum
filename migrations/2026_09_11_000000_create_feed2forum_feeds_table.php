<?php

use Flarum\Database\Migration;

return Migration::createTable('feed2forum_feeds', function (Illuminate\Database\Schema\Blueprint $table) {
    $table->id();
    $table->string('url');
    $table->string('title');
    $table->unsignedInteger('tag_id')->nullable();
    $table->unsignedInteger('publish_limit')->default(5);
    $table->string('status')->default('active');
    $table->timestamps();

    $table->foreign('tag_id')->references('id')->on('tags')->nullOnDelete();
});