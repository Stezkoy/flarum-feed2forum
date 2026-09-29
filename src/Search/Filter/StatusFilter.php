<?php

namespace Stezkoy\Feed2forum\Search\Filter;

use Flarum\Search\Database\DatabaseSearchState;
use Flarum\Search\Filter\FilterInterface;
use Flarum\Search\SearchState;

/**
 * Powers the admin queue's `filter[status]=pending` query on the items
 * endpoint. Without a searcher registered for the Item model the API resource
 * would reject any filter parameter with a 500.
 *
 * @implements FilterInterface<DatabaseSearchState>
 */
class StatusFilter implements FilterInterface
{
    public function getFilterKey(): string
    {
        return 'status';
    }

    public function filter(SearchState $state, string|array $value, bool $negate): void
    {
        $values = array_values((array) $value);

        if ($negate) {
            $state->getQuery()->whereNotIn('status', $values);
        } else {
            $state->getQuery()->whereIn('status', $values);
        }
    }
}