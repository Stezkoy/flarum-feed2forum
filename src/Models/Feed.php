<?php

namespace Stezkoy\Feed2forum\Models;

use Flarum\Database\AbstractModel;
use Flarum\Tags\Tag;

class Feed extends AbstractModel
{
    public $timestamps = true;

    protected $table = 'feed2forum_feeds';

    protected $fillable = ['url', 'title', 'tag_id', 'secondary_tag_id', 'publish_limit', 'publish_mode', 'status'];

    protected $casts = [
        'tag_id' => 'integer',
        'secondary_tag_id' => 'integer',
        'publish_limit' => 'integer',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    public function tag()
    {
        return $this->belongsTo(Tag::class, 'tag_id');
    }

    public function secondaryTag()
    {
        return $this->belongsTo(Tag::class, 'secondary_tag_id');
    }

    public function items()
    {
        return $this->hasMany(Item::class, 'feed_id');
    }
}