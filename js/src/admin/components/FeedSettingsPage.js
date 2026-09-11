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
import tagLabel from 'ext:flarum/tags/common/helpers/tagLabel';
import FeedPreviewModal from './FeedPreviewModal';

const PREFIX = 'stezkoy-feed2forum';

export default class FeedSettingsPage extends ExtensionPage {
  oninit(vnode) {
    super.oninit(vnode);

    this.loadingFeeds = true;
    this.loadingTags = true;
    this.loadingQueue = true;
    this.savingNewFeed = false;
    this.publishing = {};
    this.fetching = {};
    this.checkingAll = false;
    this.queue = [];
    this.tags = [];
    this.logExpanded = false;
    this.logsLoaded = false;
    this.loadingLogs = false;
    this.logs = [];
    this.clearingLog = false;

    this.resetNewFeed();

    app.store
      .find('feed2forum-feeds')
      .catch(() => app.alerts.show({ type: 'error' }, app.translator.trans(`${PREFIX}.admin.settings.load_error`)))
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

    this.loadQueue();
  }

  content() {
    return m(
      '.ExtensionPage-settings',
      m('.container', [
        m('.Feed2forumSettings', [
          this.section('general_heading', [this.authorSetting(), this.fetchIntervalSetting(), this.showSourceLinkSetting()], 'general_help'),
          this.section('queue_heading', [this.queueBody()]),
          this.logSection(),
          this.section('feeds_heading', [this.checkAllButton(), this.feedsBody()]),
          m('.Form-group.Form-controls', [this.submitButton(), this.resetButton()]),
        ]),
      ])
    );
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
              m(
                'button.Button.Button--icon.Feed2forumAuthorButton',
                {
                  type: 'button',
                  title: this.translate('author_change_tooltip'),
                  onclick: () => this.selectAuthor(stream),
                },
                m(Avatar, { user, className: 'Feed2forumAuthorAvatar' })
              ),
              m(
                'button.Button.Button--icon',
                {
                  type: 'button',
                  title: this.translate('author_unbind_tooltip'),
                  onclick: () => {
                    stream('');
                    m.redraw();
                  },
                },
                m(Icon, { name: 'fas fa-times' })
              ),
            ]
          : m(
              'button.Button',
              {
                type: 'button',
                onclick: () => this.selectAuthor(stream),
              },
              this.translate('author_select_button')
            ),
      ]),
      m('p.helpText', this.translate('author_help')),
    ]);
  }

  selectAuthor(stream) {
    this.openModal(UserSelectionModal, {
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
    const stream = this.setting(key, '60');

    return m('.Form-group', [
      m('label', this.translate('fetch_interval_label')),
      m('input.FormControl', {
        type: 'number',
        min: '1',
        step: '1',
        value: stream(),
        oninput: withAttr('value', stream),
      }),
      m('p.helpText', this.translate('fetch_interval_help')),
    ]);
  }

  showSourceLinkSetting() {
    const key = `${PREFIX}.show_source_link`;
    const stream = this.setting(key, '1');
    const state = String(stream()) === '1';

    return m('.Form-group', [
      m(
        Switch,
        {
          state,
          onchange: (value) => {
            stream(value ? '1' : '0');
            m.redraw();
          },
        },
        this.translate('show_source_link_label')
      ),
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
            wasDeleted: !!(res.attributes && res.attributes.was_deleted),
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
        app.alerts.show({ type: 'success' }, this.translate('queue_published'));
        this.loadQueue();
      })
      .catch((error) => {
        const detail = error?.response?.errors?.[0]?.detail;
        app.alerts.show({ type: 'error' }, detail || this.translate('queue_publish_error'));
      })
      .finally(() => {
        delete this.publishing[id];
        m.redraw();
      });
  }

  clearQueue() {
    if (!confirm(this.translate('queue_clear_confirmation'))) return;

    app
      .request({
        method: 'POST',
        url: `${app.forum.attribute('apiUrl')}/feed2forum-items/clear`,
      })
      .then(() => {
        app.alerts.show({ type: 'success' }, this.translate('queue_clear_success'));
        this.loadQueue();
      })
      .catch(() => app.alerts.show({ type: 'error' }, this.translate('queue_clear_error')));
  }

  logSection() {
    return m(
      '.Feed2forumSettings-section',
      m(
        '.Feed2forumLogHeader',
        {
          onclick: () => this.toggleLog(),
          role: 'button',
        },
        [
          m(Icon, { name: this.logExpanded ? 'fas fa-chevron-down' : 'fas fa-chevron-right' }),
          m('h3', this.translate('log_heading')),
          m('span.Feed2forumLogHint', this.translate('log_hint')),
        ]
      ),
      this.logExpanded ? m('.Feed2forumSettings-sectionBody', [this.logBody()]) : null
    );
  }

  toggleLog() {
    this.logExpanded = !this.logExpanded;

    if (this.logExpanded && !this.logsLoaded) {
      this.loadLogs();
    }

    m.redraw();
  }

  loadLogs() {
    this.loadingLogs = true;
    m.redraw();

    app
      .request({
        method: 'GET',
        url: `${app.forum.attribute('apiUrl')}/feed2forum-logs?page[limit]=100`,
      })
      .then((response) => {
        this.logs = (response.data || []).map((res) => ({
          id: res.id,
          level: (res.attributes && res.attributes.level) || 'info',
          message: (res.attributes && res.attributes.message) || '',
          createdAt: (res.attributes && res.attributes.created_at) || null,
        }));
        this.logsLoaded = true;
      })
      .catch(() => app.alerts.show({ type: 'error' }, this.translate('log_load_error')))
      .finally(() => {
        this.loadingLogs = false;
        m.redraw();
      });
  }

  clearLog() {
    if (!confirm(this.translate('log_clear_confirmation'))) return;

    this.clearingLog = true;
    m.redraw();

    app
      .request({
        method: 'POST',
        url: `${app.forum.attribute('apiUrl')}/feed2forum-logs/clear`,
      })
      .then(() => {
        app.alerts.show({ type: 'success' }, this.translate('log_clear_success'));
        this.logs = [];
        this.loadLogs();
      })
      .catch(() => app.alerts.show({ type: 'error' }, this.translate('log_clear_error')))
      .finally(() => {
        this.clearingLog = false;
        m.redraw();
      });
  }

  logBody() {
    return [
      m('.Feed2forumQueueToolbar', [
        m('span', m('strong', this.translate('log_count', { count: this.logs.length }))),
        m('.Feed2forumLogActions', [
          m(Button, {
            className: 'Button Button--icon',
            icon: 'fas fa-sync',
            loading: this.loadingLogs,
            title: this.translate('log_refresh'),
            onclick: () => this.loadLogs(),
          }),
          m(
            Button,
            {
              className: 'Button Button--danger',
              icon: 'fas fa-broom',
              loading: this.clearingLog,
              onclick: () => this.clearLog(),
            },
            this.translate('log_clear')
          ),
        ]),
      ]),
      this.loadingLogs && !this.logsLoaded
        ? m(LoadingIndicator, { display: 'block' })
        : this.logs.length
        ? m(
            '.Feed2forumLogList',
            this.logs.map((entry) =>
              m('.Feed2forumLogItem', { className: `Feed2forumLogItem--${entry.level}` }, [
                m('span.Feed2forumLogItem-time', entry.createdAt ? dayjs(entry.createdAt).format('YYYY-MM-DD HH:mm') : '—'),
                m('span.Feed2forumLogItem-level', this.translate(`log_level_${entry.level}`)),
                m('span.Feed2forumLogItem-message', entry.message),
              ])
            )
          )
        : m('p.helpText', this.translate('log_empty')),
    ];
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
      m('.Feed2forumQueueToolbar', [
        m('span', m('strong', this.translate('queue_count', { count: this.queue.length }))),
        m(
          Button,
          {
            className: 'Button Button--danger',
            icon: 'fas fa-broom',
            onclick: () => this.clearQueue(),
          },
          this.translate('queue_clear')
        ),
      ]),
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
            m('.Feed2forumTable-cell.Feed2forumTable-cell--grow', [
              row.title,
              row.wasDeleted ? m('span.Feed2forumRestoredBadge', this.translate('queue_restored_badge')) : null,
            ]),
            m('.Feed2forumTable-cell', row.publishedAt ? dayjs(row.publishedAt).format('YYYY-MM-DD HH:mm') : '—'),
            m('.Feed2forumTable-cell.Feed2forumTable-actions', [
              m(
                Button,
                {
                  className: 'Button Button--primary',
                  icon: 'fas fa-paper-plane',
                  loading: !!this.publishing[row.id],
                  onclick: () => this.publishItem(row.id),
                },
                this.translate('queue_publish')
              ),
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
        this.loadQueue();
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
