<?php

namespace Stezkoy\Feed2forum\Search\Filter;

use Flarum\Search\Database\DatabaseSearchState;
use Flarum\Search\Filter\FilterInterface;
use Flarum\Search\SearchState;

/**
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