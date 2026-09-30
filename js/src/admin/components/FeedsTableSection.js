import Component from 'flarum/common/Component';
import app from 'flarum/admin/app';
import Button from 'flarum/common/components/Button';
import Icon from 'flarum/common/components/Icon';
import LoadingIndicator from 'flarum/common/components/LoadingIndicator';
import Select from 'flarum/common/components/Select';
import tagLabel from 'ext:flarum/tags/common/helpers/tagLabel';
import FeedPreviewModal from './FeedPreviewModal';
import FeedRow from './FeedRow';
import NewFeedRow from './NewFeedRow';

const PREFIX = 'stezkoy-feed2forum';

/**
 * Feeds table: create/update/toggle/fetch/delete feeds, tag selection and the
 * preview modal. Owns its own feeds/tags loading state.
 */
export default class FeedsTableSection extends Component {
  oninit(vnode) {
    super.oninit(vnode);

    this.loadingFeeds = true;
    this.loadingTags = true;
    this.newFeed = null;
    this.savingNewFeed = false;
    this.fetching = {};
    this.restoring = {};
    this.checkingAll = false;
    this.tags = [];

    this.resetNewFeed();

    this.loadFeeds();

    // Per the group docs: load the FULL tag list (incl. children) via
    // app.tagList.load(['parent']) instead of relying on app.store.all('tags').
    (app.tagList ? app.tagList.load(['parent']) : app.store.find('tags'))
      .then((tags) => {
        this.tags = tags || [];
      })
      .catch(() => {})
      .finally(() => {
        this.loadingTags = false;
        m.redraw();
      });
  }

  view() {
    return m('.Feed2forumSettings-section', [
      m('h3', this.translate('feeds_heading')),
      m('.Feed2forumSettings-sectionBody', [this.checkAllButton(), this.feedsBody()]),
    ]);
  }

  translate(key, vars = {}, extract = false) {
    // Parametrized translations come back as an array of children (ICU rich
    // format); when one lands in an attribute or confirm() it must be
    // extracted to a plain string, otherwise Array.toString() joins the
    // children with commas — "(,15,)".
    return app.translator.trans(`${PREFIX}.admin.settings.${key}`, vars, extract);
  }

  // Avoid the Chrome "Blocked aria-hidden on an element because its
  // descendant retained focus" warning when a modal opens.
  openModal(loader, attrs) {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    app.modal.show(loader, attrs);
  }

  checkAllButton() {
    return m(
      '.Feed2forumCheckAllRow',
      m(
        Button,
        {
          className: 'Button',
          icon: 'fas fa-sync',
          loading: this.checkingAll,
          disabled: this.checkingAll,
          onclick: () => this.fetchAllFeeds(),
        },
        this.translate('check_all')
      )
    );
  }

  loadFeeds() {
    this.loadingFeeds = true;
    m.redraw();

    app.store
      .find('feed2forum-feeds')
      .catch(() => app.alerts.show({ type: 'error' }, this.translate('load_error')))
      .finally(() => {
        this.loadingFeeds = false;
        m.redraw();
      });
  }

  restoreSkipped(feed) {
    const count = Number(feed.skippedCount() ?? 0);

    if (!count || this.restoring[feed.id()]) return;

    if (!confirm(this.translate('restore_skipped_confirmation', { count }, true))) return;

    this.restoring[feed.id()] = true;
    m.redraw();

    app
      .request({
        method: 'POST',
        url: `${app.forum.attribute('apiUrl')}/feed2forum-feeds/${feed.id()}/restore-skipped`,
      })
      .then((response) => {
        app.alerts.show({ type: 'success' }, this.translate('restore_skipped_success', { count: response?.meta?.restored ?? 0 }));

        // The feeds list (skipped counts) and the queue are both stale now.
        this.loadFeeds();

        if (this.attrs.onFeedsChanged) this.attrs.onFeedsChanged();
      })
      .catch(() => app.alerts.show({ type: 'error' }, this.translate('restore_skipped_error')))
      .finally(() => {
        delete this.restoring[feed.id()];
        m.redraw();
      });
  }

  fetchAllFeeds() {
    this.checkingAll = true;
    m.redraw();

    app
      .request({
        method: 'POST',
        url: `${app.forum.attribute('apiUrl')}/feed2forum-feeds/fetch-all`,
      })
      .then(() => app.alerts.show({ type: 'success' }, this.translate('check_all_success')))
      .catch(() => app.alerts.show({ type: 'error' }, this.translate('fetch_error')))
      .finally(() => {
        this.checkingAll = false;
        m.redraw();
      });
  }

  fetchFeed(feed) {
    this.fetching[feed.id()] = true;
    m.redraw();

    app
      .request({
        method: 'POST',
        url: `${app.forum.attribute('apiUrl')}/feed2forum-feeds/${feed.id()}/fetch`,
      })
      .then(() => app.alerts.show({ type: 'success' }, this.translate('fetch_success')))
      .catch(() => app.alerts.show({ type: 'error' }, this.translate('fetch_error')))
      .finally(() => {
        delete this.fetching[feed.id()];
        m.redraw();
      });
  }

  feedsBody() {
    if (this.loadingFeeds) return m(LoadingIndicator, { display: 'block' });

    const feeds = app.store.all('feed2forum-feeds');

    return [
      m('.Feed2forumTable.Feed2forumTable--feeds', [
        m('.Feed2forumTable-row.Feed2forumTable-row--head', [
          m('.Feed2forumTable-cell', this.translate('feeds_heading_title')),
          m('.Feed2forumTable-cell.Feed2forumTable-cell--grow', this.translate('feeds_heading_url')),
          m('.Feed2forumTable-cell', this.translate('feeds_heading_tag')),
          m('.Feed2forumTable-cell', this.translate('feeds_heading_limit')),
          m('.Feed2forumTable-cell', this.translate('feeds_heading_mode')),
          m('.Feed2forumTable-cell', this.translate('feeds_heading_status')),
          m('.Feed2forumTable-cell.Feed2forumTable-actions', this.translate('feeds_heading_actions')),
        ]),
        ...feeds.map((feed) => m(FeedRow, { feed, section: this })),
        m(NewFeedRow, { feed: this.newFeed, section: this }),
      ]),
      m('p.helpText', this.translate('feeds_hint')),
    ];
  }

  tagSelect(feed) {
    if (this.loadingTags) {
      return m('button.Button.Button--icon', { disabled: true }, m(Icon, { name: 'fas fa-tag' }));
    }

    const selected = this.feedTags(feed);

    return m(
      Button,
      {
        className: 'Button Feed2forumTagButton',
        onclick: () => {
          this.openModal(() => import('ext:flarum/tags/common/components/TagSelectionModal'), {
            title: this.translate('tag_select_title'),
            selectedTags: selected,
            limits: { max: { total: 2, primary: 1, secondary: 1 } },
            onsubmit: (tags) => {
              const primary = tags[0] || null;
              const secondary = tags[1] || null;
              const attrs = {
                tag_id: primary ? primary.id() : null,
                secondary_tag_id: secondary ? secondary.id() : null,
              };

              feed.pushAttributes(attrs);

              if (feed.exists) this.updateFeed(feed, attrs);
            },
          });
        },
      },
      selected.length ? selected.map((tag) => tagLabel(tag)) : m('span.TextMuted', this.translate('tag_none'))
    );
  }

  feedTags(feed) {
    return [feed.tagId(), feed.secondaryTagId()]
      .filter((id) => id != null && id !== '')
      .map((id) => this.tags.find((tag) => String(tag.id()) === String(id)))
      .filter(Boolean);
  }

  publishModeSelect(feed) {
    return m(Select, {
      value: feed.publishMode() || 'queue',
      onchange: (value) => {
        feed.pushAttributes({ publish_mode: value });
        if (feed.exists) this.updateFeed(feed, 'publish_mode', value);
      },
      options: {
        queue: this.translate('publish_mode_queue'),
        auto: this.translate('publish_mode_auto'),
      },
    });
  }

  openPreviewModal(feed) {
    this.openModal(FeedPreviewModal, { feed });
  }

  resetNewFeed() {
    this.newFeed = app.store.createRecord('feed2forum-feeds', {
      attributes: {
        title: '',
        url: '',
        tag_id: null,
        secondary_tag_id: null,
        publish_limit: 5,
        publish_mode: 'queue',
        status: 'active',
      },
    });
  }

  createFeed() {
    const title = this.newFeed.title() ? this.newFeed.title().trim() : '';
    const url = this.newFeed.url() ? this.newFeed.url().trim() : '';
    const tagId = this.newFeed.tagId();
    const secondaryTagId = this.newFeed.secondaryTagId();
    const publishLimit = this.parseLimit(this.newFeed.publishLimit());

    if (!title || !url) return;

    if (!/^https?:\/\//i.test(url)) {
      app.alerts.show({ type: 'error' }, this.translate('new_feed_url_invalid'));
      return;
    }

    this.savingNewFeed = true;
    m.redraw();

    this.newFeed
      .save({
        title,
        url,
        tag_id: tagId === '' || tagId === null || tagId === undefined ? null : Number(tagId),
        secondary_tag_id: secondaryTagId === '' || secondaryTagId === null || secondaryTagId === undefined ? null : Number(secondaryTagId),
        publish_limit: publishLimit,
        publish_mode: this.newFeed.publishMode() || 'queue',
        status: this.newFeed.status() || 'active',
      })
      .then(() => {
        this.resetNewFeed();

        // The new feed may have queued items — ask the page to refresh the
        // approval queue section.
        if (this.attrs.onFeedsChanged) this.attrs.onFeedsChanged();
      })
      .catch(() => app.alerts.show({ type: 'error' }, this.translate('new_feed_error')))
      .finally(() => {
        this.savingNewFeed = false;
        m.redraw();
      });
  }

  updateFeed(feed, attribute, value) {
    const data = typeof attribute === 'object' && attribute !== null ? attribute : { [attribute]: value };

    feed.save(data).catch(() => app.alerts.show({ type: 'error' }, this.translate('feed_update_error')));
  }

  toggleFeedStatus(feed) {
    feed
      .save({ status: feed.status() === 'active' ? 'paused' : 'active' })
      .catch(() => app.alerts.show({ type: 'error' }, this.translate('feed_update_error')));
  }

  deleteFeed(feed) {
    if (!confirm(this.translate('feeds_delete_confirmation'))) return;

    feed.delete().catch(() => app.alerts.show({ type: 'error' }, this.translate('feed_delete_error')));
  }

  parseLimit(value) {
    // Matches the docs: leave empty (or invalid) for the default 5,
    // type 0 explicitly for unlimited.
    const raw = String(value ?? '').trim();

    if (raw === '') return 5;

    const parsed = Number(raw);

    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 5;
  }
}
