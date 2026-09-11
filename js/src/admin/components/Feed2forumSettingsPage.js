import app from 'flarum/admin/app';
import ExtensionPage from 'flarum/admin/components/ExtensionPage';
import Switch from 'flarum/common/components/Switch';
import Select from 'flarum/common/components/Select';
import Button from 'flarum/common/components/Button';
import Avatar from 'flarum/common/components/Avatar';
import Icon from 'flarum/common/components/Icon';
import LoadingIndicator from 'flarum/common/components/LoadingIndicator';
import UserSelectionModal from 'flarum/common/components/UserSelectionModal';
import withAttr from 'flarum/common/utils/withAttr';
import FeedPreviewModal from './FeedPreviewModal';

const PREFIX = 'stezkoy-feed2forum';

export default class Feed2forumSettingsPage extends ExtensionPage {
  oninit(vnode) {
    super.oninit(vnode);

    this.loadingFeeds = true;
    this.loadingTags = true;
    this.loadingQueue = true;
    this.savingNewFeed = false;
    this.publishing = {};
    this.queue = [];

    this.resetNewFeed();

    app.store
      .find('feed2forum-feeds')
      .catch(() =>
        app.alerts.show({ type: 'error' }, app.translator.trans(`${PREFIX}.admin.settings.load_error`))
      )
      .finally(() => {
        this.loadingFeeds = false;
        m.redraw();
      });

    app.store
      .find('tags')
      .catch(() => {})
      .finally(() => {
        this.loadingTags = false;
        m.redraw();
      });

    this.loadQueue();
  }

  content() {
    return m('.ExtensionPage-settings', m('.container', [
      m('.Feed2forumSettings', [
        this.section(
          'general_heading',
          [
            this.authorSetting(),
            this.fetchIntervalSetting(),
            this.publishModeSetting(),
            this.showSourceLinkSetting(),
          ],
          'general_help'
        ),
        this.section('queue_heading', [this.queueBody()]),
        this.section('feeds_heading', [this.feedsBody()]),
        m('.Form-group.Form-controls', [this.submitButton(), this.resetButton()]),
      ]),
    ]));
  }

  section(key, children, helpKey = null) {
    return m('.Feed2forumSettings-section', [
      m('h3', app.translator.trans(`${PREFIX}.admin.settings.${key}`)),
      m('.Feed2forumSettings-sectionBody', [
        helpKey !== null && m('p.helpText', app.translator.trans(`${PREFIX}.admin.settings.${helpKey}`)),
        children,
      ]),
    ]);
  }

  translate(key, vars = null) {
    return app.translator.trans(`${PREFIX}.admin.settings.${key}`, vars);
  }

  authorSetting() {
    const key = `${PREFIX}.author_user_id`;
    const stream = this.setting(key, '');
    const raw = String(stream() || '');
    const userId = Number(raw);
    const user = userId ? app.store.getById('users', String(userId)) || null : null;

    return m('.Form-group', [
      m('label', this.translate('author_label')),
      m('.Feed2forumAuthorControl', [
        user
          ? [
              m('button.Button.Button--icon.Feed2forumAuthorButton', {
                type: 'button',
                title: this.translate('author_change_tooltip'),
                onclick: () => this.selectAuthor(stream),
              }, m(Avatar, { user, className: 'Feed2forumAuthorAvatar' })),
              m('button.Button.Button--icon', {
                type: 'button',
                title: this.translate('author_unbind_tooltip'),
                onclick: () => {
                  stream('');
                  m.redraw();
                },
              }, m(Icon, { name: 'fas fa-times' })),
            ]
          : m('button.Button', {
              type: 'button',
              onclick: () => this.selectAuthor(stream),
            }, this.translate('author_select_button')),
      ]),
      m('p.helpText', this.translate('author_help')),
    ]);
  }

  selectAuthor(stream) {
    app.modal.show(UserSelectionModal, {
      title: this.translate('author_select_title'),
      selected: [],
      maxItems: 1,
      onsubmit: (users) => {
        const user = users[0];
        if (user) stream(String(user.id()));
        m.redraw();
      },
    });
  }

  fetchIntervalSetting() {
    const key = `${PREFIX}.fetch_interval`;
    const stream = this.setting(key, 'hourly');

    return m('.Form-group', [
      m('label', this.translate('fetch_interval_label')),
      m(Select, {
        value: stream(),
        onchange: (value) => {
          stream(value);
          m.redraw();
        },
        options: {
          minutely: this.translate('interval_minutely'),
          hourly: this.translate('interval_hourly'),
          daily: this.translate('interval_daily'),
          weekly: this.translate('interval_weekly'),
        },
      }),
      m('p.helpText', this.translate('fetch_interval_help')),
    ]);
  }

  publishModeSetting() {
    const key = `${PREFIX}.publish_mode`;
    const stream = this.setting(key, 'auto');
    const state = String(stream()) === 'queue';

    return m('.Form-group', [
      m(Switch, {
        state,
        onchange: (value) => {
          stream(value ? 'queue' : 'auto');
          m.redraw();
        },
      }, this.translate('publish_mode_label')),
      m('p.helpText', this.translate('publish_mode_help')),
    ]);
  }

  showSourceLinkSetting() {
    const key = `${PREFIX}.show_source_link`;
    const stream = this.setting(key, '1');
    const state = String(stream()) === '1';

    return m('.Form-group', [
      m(Switch, {
        state,
        onchange: (value) => {
          stream(value ? '1' : '');
          m.redraw();
        },
      }, this.translate('show_source_link_label')),
      m('p.helpText', this.translate('show_source_link_help')),
    ]);
  }

  loadQueue() {
    this.loadingQueue = true;
    m.redraw();

    app
      .request({
        method: 'GET',
        url: `${app.forum.attribute('apiUrl')}/feed2forum-items?filter[status]=pending&page[limit]=100`,
      })
      .then((response) => {
        const included = {};
        (response.included || []).forEach((res) => {
          included[`${res.type}:${res.id}`] = res;
        });

        this.queue = (response.data || []).map((res) => {
          const rel = res.relationships && res.relationships.feed && res.relationships.feed.data;
          const feed = rel ? included[`${rel.type}:${rel.id}`] : null;
          const wasPublished = res.attributes && res.attributes.status === 'published';

          return {
            id: res.id,
            title: (res.attributes && res.attributes.title) || '',
            publishedAt: (res.attributes && res.attributes.published_at) || null,
            feedTitle: feed && feed.attributes ? feed.attributes.title : '—',
            wasPublished,
          };
        });
      })
      .catch(() => app.alerts.show({ type: 'error' }, this.translate('queue_load_error')))
      .finally(() => {
        this.loadingQueue = false;
        m.redraw();
      });
  }

  publishItem(id) {
    this.publishing[id] = true;
    m.redraw();

    app
      .request({
        method: 'POST',
        url: `${app.forum.attribute('apiUrl')}/feed2forum-items/${id}/publish`,
      })
      .then(() => {
        app.alerts.show({ type: 'success' }, this.translate('queue_queued'));
        this.loadQueue();
      })
      .catch(() => app.alerts.show({ type: 'error' }, this.translate('queue_publish_error')))
      .finally(() => {
        delete this.publishing[id];
        m.redraw();
      });
  }

  deleteItem(id) {
    if (!confirm(this.translate('queue_delete_confirmation'))) return;

    app
      .request({
        method: 'DELETE',
        url: `${app.forum.attribute('apiUrl')}/feed2forum-items/${id}`,
      })
      .then(() => this.loadQueue())
      .catch(() => app.alerts.show({ type: 'error' }, this.translate('queue_delete_error')));
  }

  queueBody() {
    if (this.loadingQueue) return m(LoadingIndicator, { display: 'block' });

    if (!this.queue.length) {
      return m('p.helpText', this.translate('queue_empty'));
    }

    return [
      m('.Feed2forumTable.Feed2forumTable--queue', [
        m('.Feed2forumTable-row.Feed2forumTable-row--head', [
          m('.Feed2forumTable-cell', this.translate('queue_heading_feed')),
          m('.Feed2forumTable-cell.Feed2forumTable-cell--grow', this.translate('queue_heading_title')),
          m('.Feed2forumTable-cell', this.translate('queue_heading_published')),
          m('.Feed2forumTable-cell.Feed2forumTable-actions', this.translate('queue_heading_actions')),
        ]),
        ...this.queue.map((row) =>
          m('.Feed2forumTable-row', [
            m('.Feed2forumTable-cell', row.feedTitle),
            m('.Feed2forumTable-cell.Feed2forumTable-cell--grow', row.title),
            m('.Feed2forumTable-cell', row.publishedAt ? dayjs(row.publishedAt).format('YYYY-MM-DD HH:mm') : '—'),
            m('.Feed2forumTable-cell.Feed2forumTable-actions', [
              m(Button, {
                className: 'Button Button--primary',
                icon: 'fas fa-paper-plane',
                loading: !!this.publishing[row.id],
                onclick: () => this.publishItem(row.id),
              }, this.translate('queue_publish')),
              m(Button, {
                className: 'Button Button--danger',
                icon: 'fas fa-trash',
                title: this.translate('queue_delete_tooltip'),
                onclick: () => this.deleteItem(row.id),
              }),
            ]),
          ])
        ),
      ]),
      m('p.helpText', this.translate('queue_hint')),
    ];
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
      m('.Feed2forumTable-cell', m('input.FormControl', {
        type: 'text',
        value: feed.title() || '',
        oninput: withAttr('value', (v) => feed.pushAttributes({ title: v })),
        onblur: withAttr('value', (v) => this.updateFeed(feed, 'title', v.trim())),
      })),
      m('.Feed2forumTable-cell.Feed2forumTable-cell--grow', m('input.FormControl', {
        type: 'url',
        value: feed.url() || '',
        oninput: withAttr('value', (v) => feed.pushAttributes({ url: v })),
        onblur: withAttr('value', (v) => this.updateFeed(feed, 'url', v.trim())),
      })),
      m('.Feed2forumTable-cell', this.tagSelect(feed)),
      m('.Feed2forumTable-cell', m('input.FormControl', {
        type: 'number',
        min: '0',
        value: feed.publishLimit() != null ? feed.publishLimit() : '',
        oninput: withAttr('value', (v) => feed.pushAttributes({ publish_limit: v })),
        onblur: withAttr('value', (v) => this.updateFeed(feed, 'publish_limit', this.parseLimit(v))),
      })),
      m('.Feed2forumTable-cell', m(Switch, {
        state: feed.status() === 'active',
        onchange: () => this.toggleFeedStatus(feed),
      })),
      m('.Feed2forumTable-cell.Feed2forumTable-actions', [
        m(Button, {
          className: 'Button Button--icon',
          icon: 'fas fa-eye',
          title: this.translate('preview_tooltip'),
          onclick: () => app.modal.show(FeedPreviewModal, { feed }),
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
      return m('select.FormControl', { disabled: true }, m('option', '…'));
    }

    const options = {
      '': this.translate('tag_none'),
      ...Object.fromEntries(
        app.store
          .all('tags')
          .map((tag) => [String(tag.id()), tag.name()])
      ),
    };

    return m('select.FormControl', {
      value: feed.tagId() != null ? String(feed.tagId()) : '',
      onchange: withAttr('value', (v) => {
        const tagId = v === '' ? null : Number(v);
        feed.pushAttributes({ tag_id: tagId });
        if (feed.exists) this.updateFeed(feed, 'tag_id', tagId);
      }),
    }, Object.keys(options).map((key) => m('option', { value: key }, options[key])));
  }

  newFeedRow() {
    const feed = this.newFeed;

    return m('.Feed2forumTable-row.Feed2forumTable-row--new', [
      m('.Feed2forumTable-cell', m('input.FormControl', {
        type: 'text',
        placeholder: this.translate('new_feed_title'),
        value: feed.title() || '',
        oninput: withAttr('value', (v) => feed.pushAttributes({ title: v })),
      })),
      m('.Feed2forumTable-cell.Feed2forumTable-cell--grow', m('input.FormControl', {
        type: 'url',
        placeholder: this.translate('new_feed_url'),
        value: feed.url() || '',
        oninput: withAttr('value', (v) => feed.pushAttributes({ url: v })),
      })),
      m('.Feed2forumTable-cell', this.tagSelect(feed)),
      m('.Feed2forumTable-cell', m('input.FormControl', {
        type: 'number',
        min: '0',
        placeholder: '5',
        value: feed.publishLimit() == null ? '' : feed.publishLimit(),
        oninput: withAttr('value', (v) => feed.pushAttributes({ publish_limit: v })),
      })),
      m('.Feed2forumTable-cell', m(Switch, {
        state: feed.status() === 'active',
        onchange: () =>
          feed.pushAttributes({ status: feed.status() === 'active' ? 'paused' : 'active' }),
      })),
      m('.Feed2forumTable-cell.Feed2forumTable-actions', [
        m(Button, {
          className: 'Button Button--primary',
          icon: 'fas fa-plus',
          loading: this.savingNewFeed,
          disabled: this.savingNewFeed,
          onclick: () => this.createFeed(),
        }, this.translate('new_feed_add')),
      ]),
    ]);
  }

  resetNewFeed() {
    this.newFeed = app.store.createRecord('feed2forum-feeds', {
      attributes: {
        title: '',
        url: '',
        tag_id: null,
        publish_limit: 5,
        status: 'active',
      },
    });
  }

  createFeed() {
    const title = this.newFeed.title() ? this.newFeed.title().trim() : '';
    const url = this.newFeed.url() ? this.newFeed.url().trim() : '';
    const tagId = this.newFeed.tagId();
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
        publish_limit: publishLimit,
        status: this.newFeed.status() || 'active',
      })
      .then(() => {
        this.resetNewFeed();
        this.loadQueue();
      })
      .catch(() => app.alerts.show({ type: 'error' }, this.translate('new_feed_error')))
      .finally(() => {
        this.savingNewFeed = false;
        m.redraw();
      });
  }

  updateFeed(feed, attribute, value) {
    feed.save({ [attribute]: value }).catch(() =>
      app.alerts.show({ type: 'error' }, this.translate('feed_update_error'))
    );
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