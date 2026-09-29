<?php

namespace Stezkoy\Feed2forum\Search;

use Flarum\Search\Database\AbstractSearcher;
use Flarum\User\User;
use Illuminate\Database\Eloquent\Builder;
use Stezkoy\Feed2forum\Models\Item;

class ItemSearcher extends AbstractSearcher
{
    public function getQuery(User $actor): Builder
    {
        return Item::query()
            ->with(['feed'])
            ->orderByDesc('published_at')
            ->orderByDesc('id');
    }
}