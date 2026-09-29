import app from 'flarum/admin/app';
import ExtensionPage from 'flarum/admin/components/ExtensionPage';
import Switch from 'flarum/common/components/Switch';
import Select from 'flarum/common/components/Select';
import Avatar from 'flarum/common/components/Avatar';
import Icon from 'flarum/common/components/Icon';
import LoadingIndicator from 'flarum/common/components/LoadingIndicator';
import UserSelectionModal from 'flarum/common/components/UserSelectionModal';
import withAttr from 'flarum/common/utils/withAttr';
import FeedsTableSection from './FeedsTableSection';
import LogSection from './LogSection';
import QueueSection from './QueueSection';

const PREFIX = 'stezkoy-feed2forum';

export default class FeedSettingsPage extends ExtensionPage {
  oninit(vnode) {
    super.oninit(vnode);

    this.authorFetching = false;
    this.queueRefreshKey = 0;

    // The author setting may already have a value, but the user model is not in
    // the store on first load — prefetch it so the control shows the selected
    // author right away instead of only after reopening the user selector.
    const authorUserId = Number(String(this.setting(`${PREFIX}.author_user_id`, '')() || ''));
    if (authorUserId) {
      this.authorFetching = true;
      app.store
        .find('users', String(authorUserId))
        .then(() => m.redraw())
        .catch(() => {})
        .finally(() => {
          this.authorFetching = false;
          m.redraw();
        });
    }
  }

  content() {
    return m(
      '.ExtensionPage-settings',
      m('.container', [
        m('.Feed2forumSettings', [
          this.section('general_heading', [this.authorSetting(), this.fetchIntervalSetting(), this.useArticleDateSetting(), this.showSourceLinkSetting()], 'general_help'),
          m(QueueSection, { refreshKey: this.queueRefreshKey }),
          m(LogSection),
          m(FeedsTableSection, { onFeedsChanged: () => this.bumpQueue() }),
          m('.Form-group.Form-controls', [this.submitButton(), this.resetButton()]),
        ]),
      ])
    );
  }

  bumpQueue() {
    this.queueRefreshKey += 1;
    m.redraw();
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
          : this.authorFetching
          ? m(
              'button.Button.Button--icon.Feed2forumAuthorButton',
              {
                type: 'button',
                disabled: true,
                title: this.translate('author_loading_tooltip'),
              },
              m(LoadingIndicator, { size: 'small' })
            )
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

  useArticleDateSetting() {
    const key = `${PREFIX}.use_article_date`;
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
        this.translate('use_article_date_label')
      ),
      m('p.helpText', this.translate('use_article_date_help')),
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
}
