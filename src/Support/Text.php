<?php

namespace Stezkoy\Feed2forum\Support;

use Illuminate\Support\Str;

/**
 * Shared plain-text helpers used by both the feed preview and the publisher.
 */
final class Text
{
    /**
     * Collapse HTML to a single readable plain-text line, capped at $limit
     * characters.
     */
    public static function plainText(string $content, int $limit): string
    {
        $text = trim(html_entity_decode(strip_tags($content), ENT_QUOTES | ENT_HTML5, 'UTF-8'));
        $text = preg_replace('/\s+/u', ' ', $text);

        return Str::limit($text, $limit);
    }
}
