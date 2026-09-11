<?php

namespace Stezkoy\Feed2forum\Models;

use Flarum\Database\AbstractModel;

class LogEntry extends AbstractModel
{
    public $timestamps = false;

    protected $table = 'feed2forum_logs';

    protected $fillable = ['feed_id', 'level', 'message', 'created_at'];

    protected $casts = [
        'feed_id' => 'integer',
        'created_at' => 'datetime',
    ];
}