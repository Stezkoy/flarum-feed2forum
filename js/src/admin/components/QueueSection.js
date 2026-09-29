import Component from 'flarum/common/Component';
import app from 'flarum/admin/app';
import Button from 'flarum/common/components/Button';
import LoadingIndicator from 'flarum/common/components/LoadingIndicator';

const PREFIX = 'stezkoy-feed2forum';

/**
 * Approval queue: pending items waiting for a manual publish decision.
 * Owns its own fetch state and renders straight from store model instances.
 */
export default class QueueSection extends Component {
  oninit(vnode) {
    super.oninit(vnode);

    this.loadingQueue = true;
    this.queue = [];
    this.publishing = {};

    this.loadQueue();
  }

  onbeforeupdate(vnode) {
    // Flarum's base Component stores the incoming attrs in `this.attrs`, so we
    // have to read the previous key *before* delegating. Skipping super() would
    // freeze `this.attrs` at its oninit value: every later redraw would then see
    // a "changed" key, and since loadQueue() calls m.redraw() itself, that turns
    // into an unbounded redraw + request loop.
    const previousKey = this.attrs && this.attrs.refreshKey;

    super.onbeforeupdate(vnode);

    // The feeds section bumps this key after creating a feed, so the queue
    // reloads instead of going stale.
    if (vnode.attrs.refreshKey !== previousKey) {
      this.loadQueue();
    }
  }

  view() {
    return m('.Feed2forumSettings-section', [m('h3', this.translate('queue_heading')), m('.Feed2forumSettings-sectionBody', [this.queueBody()])]);
  }

  translate(key, vars = {}) {
    return app.translator.trans(`${PREFIX}.admin.settings.${key}`, vars);
  }

  loadQueue() {
    this.loadingQueue = true;
    m.redraw();

    app.store
      .find('feed2forum-items', { filter: { status: 'pending' }, page: { limit: 100 } })
      .then((items) => {
        this.queue = items;
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

  feedTitle(row) {
    const feed = row.feed();

    return feed ? feed.title() : '—';
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
            m('.Feed2forumTable-cell', this.feedTitle(row)),
            m('.Feed2forumTable-cell.Feed2forumTable-cell--grow', [
              row.title(),
              row.wasDeleted() ? m('span.Feed2forumRestoredBadge', this.translate('queue_restored_badge')) : null,
            ]),
            m('.Feed2forumTable-cell', row.publishedAt() ? dayjs(row.publishedAt()).format('YYYY-MM-DD HH:mm') : '—'),
            m('.Feed2forumTable-cell.Feed2forumTable-actions', [
              m(
                Button,
                {
                  className: 'Button Button--primary',
                  icon: 'fas fa-paper-plane',
                  loading: !!this.publishing[row.id()],
                  onclick: () => this.publishItem(row.id()),
                },
                this.translate('queue_publish')
              ),
              m(Button, {
                className: 'Button Button--icon',
                icon: 'fas fa-trash',
                title: this.translate('queue_delete_tooltip'),
                onclick: () => this.deleteItem(row.id()),
              }),
            ]),
          ])
        ),
      ]),
      m('p.helpText', this.translate('queue_hint')),
    ];
  }
}
