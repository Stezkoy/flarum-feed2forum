<?php

namespace Stezkoy\Feed2forum\Models;

use Flarum\Database\AbstractModel;
use Flarum\Discussion\Discussion;

class Item extends AbstractModel
{
    public $timestamps = true;

    protected $table = 'feed2forum_items';

    protected $fillable = [
        'feed_id',
        'guid',
        'title',
        'content',
        'link',
        'published_at',
        'status',
        'was_deleted',
        'discussion_id',
    ];

    protected $casts = [
        'feed_id' => 'integer',
        'discussion_id' => 'integer',
        'was_deleted' => 'boolean',
        'published_at' => 'datetime',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    public function feed()
    {
        return $this->belongsTo(Feed::class, 'feed_id');
    }

    public function discussion()
    {
        return $this->belongsTo(Discussion::class, 'discussion_id');
    }
}