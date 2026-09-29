import Component from 'flarum/common/Component';
import app from 'flarum/admin/app';
import Button from 'flarum/common/components/Button';
import Icon from 'flarum/common/components/Icon';
import LoadingIndicator from 'flarum/common/components/LoadingIndicator';

const PREFIX = 'stezkoy-feed2forum';

const PAGE_SIZE = 100;

/**
 * Collapsible work log. Owns its own loading/pagination state and renders
 * straight from store model instances.
 */
export default class LogSection extends Component {
  oninit(vnode) {
    super.oninit(vnode);

    this.logExpanded = false;
    this.logsLoaded = false;
    this.loadingLogs = false;
    this.logs = [];
    this.logsOffset = 0;
    this.logsHasMore = false;
    this.clearingLog = false;
  }

  view() {
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

  translate(key, vars = {}) {
    return app.translator.trans(`${PREFIX}.admin.settings.${key}`, vars);
  }

  toggleLog() {
    this.logExpanded = !this.logExpanded;

    if (this.logExpanded && !this.logsLoaded) {
      this.loadLogs();
    }

    m.redraw();
  }

  loadLogs(offset = 0) {
    this.loadingLogs = true;
    m.redraw();

    app.store
      .find('feed2forum-logs', { page: { limit: PAGE_SIZE, offset } })
      .then((logs) => {
        this.logs = offset ? this.logs.concat(logs) : logs;
        this.logsLoaded = true;
        this.logsOffset = offset;
        this.logsHasMore = logs.length === PAGE_SIZE && !!logs.payload?.links?.next;
      })
      .catch(() => app.alerts.show({ type: 'error' }, this.translate('log_load_error')))
      .finally(() => {
        this.loadingLogs = false;
        m.redraw();
      });
  }

  loadMoreLogs() {
    if (this.logsHasMore) this.loadLogs(this.logsOffset + PAGE_SIZE);
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
            this.logs.map((entry, index) => {
              const level = entry.level() || 'info';

              return m('.Feed2forumLogItem', { className: `Feed2forumLogItem--${level}` }, [
                // Page offset is baked into the concatenated list, so the
                // array index is the global 1-based row number.
                m('span.Feed2forumLogItem-number', index + 1),
                m('span.Feed2forumLogItem-time', entry.createdAt() ? dayjs(entry.createdAt()).format('YYYY-MM-DD HH:mm') : '—'),
                m('span.Feed2forumLogItem-level', this.translate(`log_level_${level}`)),
                m('span.Feed2forumLogItem-message', entry.message()),
              ]);
            })
          )
        : m('p.helpText', this.translate('log_empty')),
      this.logsLoaded && this.logsHasMore
        ? m(
            '.Feed2forumLogMore',
            m(
              Button,
              {
                className: 'Button',
                icon: 'fas fa-chevron-down',
                loading: this.loadingLogs,
                onclick: () => this.loadMoreLogs(),
              },
              this.translate('log_more')
            )
          )
        : null,
    ];
  }
}
