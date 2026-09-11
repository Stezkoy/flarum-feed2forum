# Feed2Forum

![License](https://img.shields.io/badge/license-MIT-blue.svg) [![Latest Stable Version](https://img.shields.io/packagist/v/stezkoy/flarum-feed2forum.svg)](https://packagist.org/packages/stezkoy/flarum-feed2forum) [![Total Downloads](https://img.shields.io/packagist/dt/stezkoy/flarum-feed2forum.svg)](https://packagist.org/packages/stezkoy/flarum-feed2forum)

A Flarum 2.x extension that turns RSS/Atom feeds into **real forum discussions**: each fetched article becomes a native Flarum discussion, created by a user you choose and tagged with up to two tags you bind to the feed.

[Русская версия](readme_ru.md)

## Features

### Real discussions from feeds
- Fetch RSS/Atom sources on a schedule and turn every new article into an immediate, native Flarum discussion.
- One **global author user** for all imported discussions, configured once in the admin panel.
- Use the article's **publication date from the feed** as the discussion creation date.
- Content converted from HTML (paragraphs, lists, images, links) into Flarum formatting.

### Feeds
- Bind **up to two tags** (one primary + one secondary) to each feed — imported discussions are posted with those tags, including their parents. Tag selection uses the standard Flarum dialog.
- **Per-feed publish limit**: only the N most recent new articles are kept per fetch (0 = unlimited). In manual mode this also caps how many items land in the approval queue.
- **Per-feed publish mode**: *Immediately* (auto) or *Manually* (approval queue).
- Pause any feed with a single toggle — paused feeds are skipped during fetching.
- Preview a feed in the admin panel by fetching it live.

### Approval queue & safety
- **Manual approval queue** — articles wait in the admin panel until you publish each one with a single click (the discussion is created immediately).
- Restored items whose discussion was deleted from the forum come back with a **"Previously deleted" badge** and are never auto-published — you decide.
- Skipped items stay in the database as tombstones, so they are never re-imported.
- Deduplicate articles by their GUID/link so nothing is imported twice.
- **Clear the whole queue** or refresh all feeds on demand with dedicated buttons.

### Work log
- A collapsible log below the queue shows fetches, publications, skips and errors.
- Capped at 500 rows in the database (pruned on every write), the admin panel loads only the last 100 entries.

### Performance & ops
- Heavy work (feed fetching and discussion creation) runs as **queue jobs** (`Flarum\Queue`).
- Fetch interval is set in **minutes** (default 60) via the Flarum scheduler.
- Optional **link to the original article** at the beginning of each imported post (can be disabled globally).
- English and Russian locales.

## Requirements

- Flarum `^2.0`
- PHP `^8.3`
- `flarum/tags` (installed automatically as a dependency)

## Installation

```bash
composer require stezkoy/flarum-feed2forum
php flarum migrate
php flarum cache:clear
```

Enable **Feed2Forum** from the Flarum admin panel.

## Update

```bash
composer update stezkoy/flarum-feed2forum
php flarum migrate
php flarum cache:clear
```

## Admin Configuration

Open **Admin → Extensions → Feed2Forum**.

### General settings
- **Author** — the user who authors imported discussions. Select any user; removal/change is supported.
- **Check frequency (minutes)** — how often feeds are fetched through the Flarum scheduler (default 60 minutes).
- **Add links to original articles** — show or hide the "Original article" link at the beginning of each imported post (on by default).

### Feeds
Each row of the **Feeds** table is edited in place and saved on blur:
- **Title** and **URL** of the feed.
- **Tag** — up to two tags (one primary + one secondary) imported discussions are posted with (opened via the standard tag dialog).
- **Publish limit** — how many of the newest new articles are kept per fetch (leave empty for 5, set 0 for unlimited).
- **Publishing** — per-feed mode: *Immediately* or *Manually* (approval queue).
- **Status** — toggle to pause/resume the feed.
- Actions — **Fetch now**, **Preview** (fetch the feed live) and **Delete**.

Add new feeds via the blank row at the bottom of the table. Use **Check all feeds now** (top right) to trigger a manual fetch of every active feed.

### Approval queue
Feeds in *Manually* mode place their new articles here: publish any of them with one click, skip them, or clear the whole queue at once. Restored items are marked with a "Previously deleted" badge.

### Work log
A collapsible log below the queue: fetches, publications, skips and errors. Refresh or clear it with the toolbar buttons.

## Fetching Feeds

The extension registers the `feed2forum:fetch` command.

Fetch all active feeds:

```bash
php flarum feed2forum:fetch
```

Inspect a single URL without storing it:

```bash
php flarum feed2forum:fetch "https://example.com/feed.xml"
```

The command **does not fetch anything itself**: it dispatches one `FetchFeedJob` per active feed into the Flarum queue. Each job reads the feed, stores new items and (in auto mode) dispatches `PublishItemJob` jobs that create the discussions.

With the default `sync` driver every job runs inline, so the extension works out of the box — but for many feeds or posts, configure a real queue (database/Redis) and run a worker:

```bash
php flarum queue:work
```

The command runs on the interval chosen in the settings through Flarum's scheduler. Make sure your server runs the Flarum scheduler, for example:

```bash
* * * * * cd /path/to/flarum && php flarum schedule:run >> /dev/null 2>&1
```

## How It Works

All steps below run asynchronously through the Flarum queue (default driver: sync).

1. On each run the fetcher reads every **active** feed.
2. New articles (not seen before, deduplicated by GUID/link) are stored with their RSS publication date.
3. Existing articles are updated with the latest title/content/date and never re-imported.
4. Items whose discussion was deleted on the forum are restored to the queue with a "Previously deleted" badge (manual approval only).
5. In **auto** mode, up to the feed's *publish limit* of the newest new articles are converted into discussions right away.
6. In **queue** mode, nothing is published automatically — approve articles from the admin panel instead.
7. Each discussion gets:
   - the article's RSS publication date as its creation date,
   - content converted from HTML (paragraphs, lists, images, links) plus the source link,
   - the configured global author as its author,
   - the feed's tags (including their parent tags) applied.

## Links

[GitHub Repository](https://github.com/Stezkoy/flarum-feed2forum) · [Packagist](https://packagist.org/packages/stezkoy/flarum-feed2forum)

## License

MIT
