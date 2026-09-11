# Feed2Forum

![License](https://img.shields.io/badge/license-MIT-blue.svg)

A Flarum 2.x extension that turns RSS/Atom feeds into **real forum discussions**: each fetched article becomes a native Flarum discussion, created by a user you choose in the settings and tagged with a tag you bind to the feed.

[Read the Russian documentation](readme_ru.md)

## Features

- Fetch RSS/Atom sources on a schedule and turn every new article into an **immediate, real Flarum discussion** (no virtual pages, no lazy conversion).
- Use one **global author user** for all imported discussions, configured once in the admin panel.
- Bind **up to two tags to each feed** (one primary + one secondary) — imported discussions are posted with those tags automatically. Uses the standard Flarum tag selection dialog.
- Use the article's **publication date from the feed** as the discussion creation date.
- Set a **per-feed publish limit**: only the N most recent new articles are published per fetch (0 = unlimited).
- **Per-feed publish mode**: choose one of two options for each feed:
  - **Auto** — new articles are published right away.
  - **Manual approval queue** — articles wait in a queue in the admin panel until you publish each one with one click.
- Set the **check frequency in minutes** (default 60) applied through Flarum's scheduler.
- **Fetch Now** button for each feed and a global **Check all feeds now** button to trigger manual fetch at any time.
- Add a **link to the original article** at the top of every imported post (can be disabled globally).
- Preview a feed in the admin panel by fetching it live.
- Deduplicate articles by their GUID/link so nothing is imported twice; feed titles, contents and dates are updated on re-fetch.
- **Self-repair**: if a published discussion is deleted from the forum, its item is automatically returned to the approval queue on the next fetch with a "Previously deleted" badge. Restored items are never auto-published — an admin reviews them and decides.
- Pause any feed with a single toggle — paused feeds are skipped during fetching.
- Heavy work (feed fetching and discussion creation) runs as **queue jobs** (`Flarum\Queue`), so many posts never stall the forum.
- English and Russian locales.

## Requirements

- Flarum `^2.0`
- PHP `^8.3`
- `flarum/tags` (installed automatically as a dependency)
- Composer

## Installation

Install with Composer:

```sh
composer require stezkoy/flarum-feed2forum
php flarum migrate
php flarum cache:clear
```

Enable **Feed2Forum** from the Flarum admin panel.

## Admin Configuration

Open the **Feed2Forum** page in the admin panel.

### General settings

- **Author** — the user who authors imported discussions. Select any user; removal/change is supported.
- **Check frequency (minutes)** — how often feeds are fetched through the Flarum scheduler (default 60 minutes).
- **Add links to original articles** — show or hide the "Original article" link at the top of each imported post (on by default).

### Feeds

Each row of the **Feeds** table is edited in place and saved on blur:

- **Title** and **URL** of the feed.
- **Tag** — up to two tags (one primary + one secondary) imported discussions are posted with (opened via the standard tag dialog).
- **Publish limit** — how many of the newest new articles are kept/published per fetch (leave empty for 5, set 0 for unlimited). In manual mode this also caps how many items land in the approval queue from a single fetch.
- **Publishing** — per-feed mode: *Immediately* or *Manually* (approval queue).
- **Status** — toggle to pause/resume the feed.
- Actions — **Fetch now**, **Preview** (fetch the feed live) and **Delete**.

Add new feeds via the blank row at the bottom of the table.

### Approval queue

Feeds in *Manually* mode place their new articles here: publish any of them with one click (the discussion is created immediately and the item leaves the queue), delete them, or clear the whole queue at once.

### Work log

A collapsible log below the queue shows what the extension did: fetches, publications, skipped items and errors. It is capped at 500 rows in the database (pruned on every write) and the admin panel loads only the last 100 entries, so it cannot grow unbounded.

## Fetching Feeds

The extension registers the `feed2forum:fetch` command.

Fetch all active feeds:

```sh
php flarum feed2forum:fetch
```

Inspect a single URL without storing it:

```sh
php flarum feed2forum:fetch "https://example.com/feed.xml"
```

The command **does not fetch anything itself**: it dispatches one `FetchFeedJob` per active feed into the Flarum queue. Each job reads the feed, stores new items and (in auto mode) dispatches `PublishItemJob` jobs that create the discussions. The admin "Publish" button in the approval queue works the same way.

This means feed fetching and discussion creation happen in the queue worker, not in the scheduler or the web request:

```sh
php flarum queue:work
```

With the default `sync` driver every job runs inline, so the extension works out of the box — but for many feeds or posts, configure a real queue (database/Redis) and run a worker.

The command runs on the interval chosen in the settings through Flarum's scheduler. Make sure your server runs the Flarum scheduler, for example:

```sh
* * * * * cd /path/to/flarum && php flarum schedule:run >> /dev/null 2>&1
```

## How It Works

All steps below run asynchronously through the Flarum queue (default driver: sync).

1. On each run the fetcher reads every **active** feed.
2. New articles (not seen before, deduplicated by GUID/link) are stored with their RSS publication date.
3. Existing articles are updated with the latest title/content/date and never re-imported.
4. In **auto** mode, up to the feed's *publish limit* of the newest new articles are converted into discussions right away.
5. In **queue** mode, nothing is published automatically — approve articles from the admin panel instead.
6. Each discussion gets:
   - the article's RSS publication date as its creation date,
   - content converted from HTML (paragraphs, lists, images, links) plus the source link,
   - the configured global author as its author,
   - the feed's tag (including its parent tags) applied.

## Links

- [GitHub](https://github.com/Stezkoy/flarum-feed2forum)