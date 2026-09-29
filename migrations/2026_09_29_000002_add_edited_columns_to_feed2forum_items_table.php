<?php

use Flarum\Database\Migration;

// Pre-publish edits from the approval queue. Kept separate from
// title/content so feed-driven change detection (which compares
// title/content against the live feed) never clobbers admin edits;
// ItemPublisher prefers these when set.
return Migration::addColumns('feed2forum_items', [
    // Grammar column type + modifiers — NOT a Blueprint method name
    // (typeUnsignedInteger() does not exist; mediumText does).
    'edited_title' => ['string', 'length' => 255, 'nullable' => true],
    'edited_content' => ['mediumText', 'nullable' => true],
]);
