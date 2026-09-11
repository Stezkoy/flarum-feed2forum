import app from 'flarum/admin/app';
import Modal from 'flarum/common/components/Modal';
import Button from 'flarum/common/components/Button';
import LoadingIndicator from 'flarum/common/components/LoadingIndicator';

const PREFIX = 'stezkoy-feed2forum';

export default class FeedPreviewModal extends Modal {
  oninit(vnode) {
    super.oninit(vnode);

    this.loading = true;
    this.error = false;
    this.preview = [];

    app
      .request({
        method: 'GET',
        url: `${app.forum.attribute('apiUrl')}/feed2forum-feeds/${this.attrs.feed.id()}/preview`,
      })
      .then((response) => {
        this.preview = (response.data && response.data.attributes && response.data.attributes.items) || [];
      })
      .catch(() => {
        this.error = true;
      })
      .finally(() => {
        this.loading = false;
        m.redraw();
      });
  }

  className() {
    return 'Feed2forumPreviewModal Modal--large';
  }

  title() {
    return app.translator.trans(`${PREFIX}.admin.settings.preview_title`, {
      title: this.attrs.feed.title() || '…',
    });
  }

  content() {
    if (this.error) {
      return m('.Modal-body', [
        m('p', app.translator.trans(`${PREFIX}.admin.settings.preview_error`)),
        m('.Form-group.Form-controls', [
          m(
            Button,
            {
              className: 'Button Button--primary',
              onclick: () => this.hide(),
            },
            app.translator.trans(`${PREFIX}.admin.settings.preview_close`)
          ),
        ]),
      ]);
    }

    if (this.loading) {
      return m('.Modal-body', m(LoadingIndicator, { display: 'block' }));
    }

    if (!this.preview.length) {
      return m('.Modal-body', [
        m('p', app.translator.trans(`${PREFIX}.admin.settings.preview_empty`)),
        m('.Form-group.Form-controls', [
          m(
            Button,
            {
              className: 'Button Button--primary',
              onclick: () => this.hide(),
            },
            app.translator.trans(`${PREFIX}.admin.settings.preview_close`)
          ),
        ]),
      ]);
    }

    return m('.Modal-body', [
      m('ul.Feed2forumPreviewList', [
        ...this.preview.map((item) =>
          m('li.Feed2forumPreviewItem', [
            item.link && item.link
              ? m('a.Feed2forumPreviewItem-title', { href: item.link, target: '_blank', rel: 'noopener noreferrer' }, item.title)
              : m('span.Feed2forumPreviewItem-title', item.title),
            item.published_at && m('time.Feed2forumPreviewItem-date', dayjs(item.published_at).format('YYYY-MM-DD HH:mm')),
          ])
        ),
      ]),
      m('.Form-group.Form-controls', [
        m(
          Button,
          {
            className: 'Button Button--primary',
            onclick: () => this.hide(),
          },
          app.translator.trans(`${PREFIX}.admin.settings.preview_close`)
        ),
      ]),
    ]);
  }
}
