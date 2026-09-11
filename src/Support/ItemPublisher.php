<?php

namespace Stezkoy\Feed2forum\Support;

use Carbon\Carbon;
use Flarum\Discussion\Discussion;
use Flarum\Foundation\ValidationException;
use Flarum\Post\CommentPost;
use Flarum\Settings\SettingsRepositoryInterface;
use Flarum\Tags\Tag;
use Flarum\User\User;
use Illuminate\Contracts\Events\Dispatcher;
use Illuminate\Database\Eloquent\Collection as EloquentCollection;
use Illuminate\Support\Str;
use Stezkoy\Feed2forum\Models\Item;

class ItemPublisher
{
    public function __construct(
        protected Dispatcher $events,
        protected SettingsRepositoryInterface $settings
    ) {
    }

    public function publish(Item $item): Discussion
    {
        $author = $this->resolveAuthor();

        return $item->getConnection()->transaction(function () use ($item, $author) {
            $locked = Item::with(['feed'])
                ->whereKey($item->id)
                ->lockForUpdate()
                ->firstOrFail();

            if ($locked->discussion_id) {
                return $locked->discussion()->firstOrFail();
            }

            return $this->createDiscussionForItem($locked, $author);
        });
    }

    private function resolveAuthor(): User
    {
        $userId = (int) $this->settings->get('stezkoy-feed2forum.author_user_id');

        $user = $userId > 0 ? User::query()->find($userId) : null;

        if (! $user) {
            throw new ValidationException([
                'author' => 'Please configure the publishing user in the Feed2Forum settings.',
            ]);
        }

        return $user;
    }

    private function createDiscussionForItem(Item $item, User $author): Discussion
    {
        $discussion = Discussion::start($this->discussionTitle($item->title), $author);
        $discussion->created_at = $item->published_at ?: Carbon::now();
        $this->setOriginalUrl($discussion, $item->link);
        $discussion->save();

        $articlePost = new CommentPost();
        $articlePost->discussion_id = $discussion->id;
        $articlePost->created_at = $item->published_at ?: Carbon::now();
        $articlePost->user_id = $author->id;
        $articlePost->ip_address = '';
        $articlePost->is_private = false;
        $articlePost->setRelation('discussion', $discussion);
        $articlePost->setRelation('user', $author);

        $articleContent = $this->articlePostContent($item);

        if ($articleContent === '') {
            $articleContent = $this->plainText($item->content ?? '', 500) ?: $this->discussionTitle($item->title);
        }

        $articlePost->setContentAttribute($articleContent, $author);
        $articlePost->save();
        $articlePost->releaseEvents();

        $discussion->first_post_id = $articlePost->id;
        $discussion->refreshCommentCount();
        $discussion->refreshLastPost();
        $discussion->refreshParticipantCount();
        $discussion->save();

        $this->assignFeedTag($discussion, $item);

        foreach ($discussion->releaseEvents() as $event) {
            if (property_exists($event, 'actor') && ! $event->actor) {
                $event->actor = $author;
            }

            $this->events->dispatch($event);
        }

        $item->discussion_id = $discussion->id;
        $item->status = 'published';
        $item->save();
        $item->setRelation('discussion', $discussion);

        return $discussion;
    }

    private function assignFeedTag(Discussion $discussion, Item $item): void
    {
        $tagId = (int) ($item->feed?->tag_id ?? 0);

        if ($tagId <= 0 || ! class_exists(Tag::class)) {
            return;
        }

        $tag = Tag::query()->with('parent')->whereKey($tagId)->first();

        if (! $tag) {
            return;
        }

        $tags = $this->tagsWithAncestors($tag);
        $tagIds = $tags->filter()->pluck('id')->values()->all();

        if (! $tagIds) {
            return;
        }

        try {
            $discussion->tags()->sync($tagIds);
        } catch (\BadMethodCallException) {
            return;
        }

        $discussion->setRelation('tags', $tags->filter()->values());
    }

    private function tagsWithAncestors(Tag $tag): EloquentCollection
    {
        $tags = [];
        $current = $tag;

        while ($current) {
            array_unshift($tags, $current);
            $current = $current->parent;
        }

        return (new EloquentCollection($tags))
            ->unique(fn (Tag $tag) => $tag->id)
            ->values();
    }

    private function discussionTitle(?string $title): string
    {
        $title = trim(preg_replace('/\s+/u', ' ', (string) $title));

        if ($title === '') {
            $title = 'RSS Article';
        }

        if (mb_strlen($title) > 80) {
            $title = rtrim(mb_substr($title, 0, 77)).'...';
        }

        while (mb_strlen($title) < 3) {
            $title .= ' RSS';
        }

        return $title;
    }

    private function articlePostContent(Item $item): string
    {
        $body = $this->htmlToPostContent($item->content ?? '');
        $link = trim((string) $item->link);

        if ($link !== '' && $this->showSourceLink()) {
            return $body === ''
                ? $this->sourceLinkLine($link)
                : $this->sourceLinkLine($link)."\n\n".$body;
        }

        return $body;
    }

    private function showSourceLink(): bool
    {
        $value = $this->settings->get('stezkoy-feed2forum.show_source_link');

        if ($value === null) {
            return true;
        }

        return filter_var((string) $value, FILTER_VALIDATE_BOOL);
    }

    private function sourceLinkLine(string $link): string
    {
        return sprintf(
            '[url=%s]%s[/url]',
            str_replace(['[', ']'], ['%5B', '%5D'], $link),
            app('translator')->trans('stezkoy-feed2forum.forum.original_article_link')
        );
    }

    private function htmlToPostContent(string $html): string
    {
        $html = trim($html);

        if ($html === '') {
            return '';
        }

        $html = preg_replace('/<(script|style)\b[^>]*>.*?<\/\1>/is', '', $html);
        $html = preg_replace('/<(iframe|object|embed|form)\b[^>]*>.*?<\/\1>/is', '', $html);
        $html = preg_replace('/<(iframe|object|embed)\b[^>]*\/?>/is', '', $html);

        $html = preg_replace_callback(
            '/<img\b[^>]*\bsrc\s*=\s*(["\'])(.*?)\1[^>]*>/is',
            function (array $m): string {
                $src = trim(html_entity_decode($m[2], ENT_QUOTES | ENT_HTML5, 'UTF-8'));

                if ($src === '' || preg_match('~^(data|blob):~i', $src)) {
                    return ' ';
                }

                return "\n\n[img]".str_replace(['[', ']'], ['%5B', '%5D'], $src)."[/img]\n\n";
            },
            $html
        );

        $html = preg_replace_callback(
            '/<a\b([^>]*)>(.*?)<\/a>/is',
            function (array $m): string {
                $href = '';

                if (preg_match('/\bhref\s*=\s*(["\'])(.*?)\1/is', $m[1], $h)) {
                    $href = trim(html_entity_decode($h[2], ENT_QUOTES | ENT_HTML5, 'UTF-8'));
                }

                $text = trim(preg_replace('/\s+/u', ' ', strip_tags($m[2])) ?? '');

                if ($href === '' || preg_match('~^(javascript|mailto|tel):~i', $href)) {
                    return $text;
                }

                if ($text === '' || $text === $href) {
                    $text = preg_replace('~^https?://~i', '', $href);
                }

                return '[url='.str_replace(['[', ']'], ['%5B', '%5D'], $href).']'.$text.'[/url]';
            },
            $html
        );

        $html = preg_replace('/<li\b[^>]*>/i', "\n- ", $html);
        $html = preg_replace('/<br\s*\/?>/i', "\n", $html);
        $html = preg_replace('/<\/?(p|div|ul|ol|h[1-6]|blockquote|tr|table|thead|tbody|section|article|header|footer|pre|figcaption|figure|dl|dd|dt)\b[^>]*>/i', "\n\n", $html);

        $text = html_entity_decode(strip_tags($html), ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $text = str_replace("\r", '', $text);
        $text = preg_replace('/[ \t\x{00A0}]+/u', ' ', $text);
        $text = preg_replace('/ ?\n ?/', "\n", $text);
        $text = preg_replace('/\n{3,}/', "\n\n", $text);
        $text = trim($text);

        if ($text === '') {
            return '';
        }

        $text = rtrim(Str::limit($text, 60000, '…'));

        while (mb_strlen($text) < 3) {
            $text .= ' RSS';
        }

        return $text;
    }

    public function plainText(string $content, int $limit): string
    {
        $text = trim(html_entity_decode(strip_tags($content), ENT_QUOTES | ENT_HTML5, 'UTF-8'));
        $text = preg_replace('/\s+/u', ' ', $text);

        return Str::limit($text, $limit);
    }

    private function setOriginalUrl(Discussion $discussion, ?string $url): void
    {
        if (! $discussion->getConnection()->getSchemaBuilder()->hasColumn('discussions', 'original_url')) {
            return;
        }

        $discussion->original_url = mb_substr(trim((string) $url), 0, 255);
    }
}