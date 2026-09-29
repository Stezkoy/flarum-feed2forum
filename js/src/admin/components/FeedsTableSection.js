import Component from 'flarum/common/Component';
import app from 'flarum/admin/app';
import Button from 'flarum/common/components/Button';
import Icon from 'flarum/common/components/Icon';
import LoadingIndicator from 'flarum/common/components/LoadingIndicator';
import Switch from 'flarum/common/components/Switch';
import Select from 'flarum/common/components/Select';
import withAttr from 'flarum/common/utils/withAttr';
import tagLabel from 'ext:flarum/tags/common/helpers/tagLabel';
import FeedPreviewModal from './FeedPreviewModal';

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
    this.checkingAll = false;
    this.tags = [];

    this.resetNewFeed();

    app.store
      .find('feed2forum-feeds')
      .catch(() => app.alerts.show({ type: 'error' }, this.translate('load_error')))
      .finally(() => {
        this.loadingFeeds = false;
        m.redraw();
      });

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

  translate(key, vars = {}) {
    return app.translator.trans(`${PREFIX}.admin.settings.${key}`, vars);
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
      .then(() => app.alerts.show({ type: 'success' }, this.translate('check_all_success')))
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
        ...feeds.map((feed) => this.feedRow(feed)),
        this.newFeedRow(),
      ]),
      m('p.helpText', this.translate('feeds_hint')),
    ];
  }

  feedRow(feed) {
    return m('.Feed2forumTable-row', [
      m(
        '.Feed2forumTable-cell',
        m('input.FormControl', {
          type: 'text',
          value: feed.title() || '',
          oninput: withAttr('value', (v) => feed.pushAttributes({ title: v })),
          onblur: withAttr('value', (v) => this.updateFeed(feed, 'title', v.trim())),
        })
      ),
      m(
        '.Feed2forumTable-cell.Feed2forumTable-cell--grow',
        m('input.FormControl', {
          type: 'url',
          value: feed.url() || '',
          oninput: withAttr('value', (v) => feed.pushAttributes({ url: v })),
          onblur: withAttr('value', (v) => this.updateFeed(feed, 'url', v.trim())),
        })
      ),
      m('.Feed2forumTable-cell', this.tagSelect(feed)),
      m(
        '.Feed2forumTable-cell',
        m('input.FormControl', {
          type: 'number',
          min: '0',
          value: feed.publishLimit() != null ? feed.publishLimit() : '',
          oninput: withAttr('value', (v) => feed.pushAttributes({ publish_limit: v })),
          onblur: withAttr('value', (v) => this.updateFeed(feed, 'publish_limit', this.parseLimit(v))),
        })
      ),
      m('.Feed2forumTable-cell', this.publishModeSelect(feed)),
      m(
        '.Feed2forumTable-cell',
        m(Switch, {
          state: feed.status() === 'active',
          onchange: () => this.toggleFeedStatus(feed),
        })
      ),
      m('.Feed2forumTable-cell.Feed2forumTable-actions', [
        m(Button, {
          className: 'Button Button--icon',
          icon: 'fas fa-sync',
          loading: !!this.fetching[feed.id()],
          title: this.translate('fetch_tooltip'),
          onclick: () => this.fetchFeed(feed),
        }),
        m(Button, {
          className: 'Button Button--icon',
          icon: 'fas fa-eye',
          title: this.translate('preview_tooltip'),
          onclick: () => this.openModal(FeedPreviewModal, { feed }),
        }),
        m(Button, {
          className: 'Button Button--icon',
          icon: 'fas fa-trash',
          title: this.translate('feeds_delete_tooltip'),
          onclick: () => this.deleteFeed(feed),
        }),
      ]),
    ]);
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

  newFeedRow() {
    const feed = this.newFeed;

    return m('.Feed2forumTable-row.Feed2forumTable-row--new', [
      m(
        '.Feed2forumTable-cell',
        m('input.FormControl', {
          type: 'text',
          placeholder: this.translate('new_feed_title'),
          value: feed.title() || '',
          oninput: withAttr('value', (v) => feed.pushAttributes({ title: v })),
        })
      ),
      m(
        '.Feed2forumTable-cell.Feed2forumTable-cell--grow',
        m('input.FormControl', {
          type: 'url',
          placeholder: this.translate('new_feed_url'),
          value: feed.url() || '',
          oninput: withAttr('value', (v) => feed.pushAttributes({ url: v })),
        })
      ),
      m('.Feed2forumTable-cell', this.tagSelect(feed)),
      m(
        '.Feed2forumTable-cell',
        m('input.FormControl', {
          type: 'number',
          min: '0',
          placeholder: '5',
          value: feed.publishLimit() == null ? '' : feed.publishLimit(),
          oninput: withAttr('value', (v) => feed.pushAttributes({ publish_limit: v })),
        })
      ),
      m('.Feed2forumTable-cell', this.publishModeSelect(feed)),
      m(
        '.Feed2forumTable-cell',
        m(Switch, {
          state: feed.status() === 'active',
          onchange: () => feed.pushAttributes({ status: feed.status() === 'active' ? 'paused' : 'active' }),
        })
      ),
      m('.Feed2forumTable-cell.Feed2forumTable-actions', [
        m(
          Button,
          {
            className: 'Button Button--primary',
            icon: 'fas fa-plus',
            loading: this.savingNewFeed,
            disabled: this.savingNewFeed,
            onclick: () => this.createFeed(),
          },
          this.translate('new_feed_add')
        ),
      ]),
    ]);
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
    const requestedLimit = Number(this.newFeed.publishLimit());
    const publishLimit = Number.isFinite(requestedLimit) && requestedLimit >= 0 ? requestedLimit : 5;

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
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  }
}
