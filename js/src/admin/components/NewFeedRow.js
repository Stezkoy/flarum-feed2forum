import Component from 'flarum/common/Component';
import Button from 'flarum/common/components/Button';
import Switch from 'flarum/common/components/Switch';
import withAttr from 'flarum/common/utils/withAttr';

/**
 * The blank row at the bottom of the feeds table for adding a new feed.
 * Pure view: state lives in section.newFeed, actions in the coordinator.
 */
export default class NewFeedRow extends Component {
  view(vnode) {
    const feed = this.attrs.feed;
    const section = this.attrs.section;

    return m('.Feed2forumTable-row.Feed2forumTable-row--new', [
      m(
        '.Feed2forumTable-cell',
        m('input.FormControl', {
          type: 'text',
          placeholder: section.translate('new_feed_title'),
          value: feed.title() || '',
          oninput: withAttr('value', (v) => feed.pushAttributes({ title: v })),
        })
      ),
      m(
        '.Feed2forumTable-cell.Feed2forumTable-cell--grow',
        m('input.FormControl', {
          type: 'url',
          placeholder: section.translate('new_feed_url'),
          value: feed.url() || '',
          oninput: withAttr('value', (v) => feed.pushAttributes({ url: v })),
        })
      ),
      m('.Feed2forumTable-cell', section.tagSelect(feed)),
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
      m('.Feed2forumTable-cell', section.publishModeSelect(feed)),
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
            loading: section.savingNewFeed,
            disabled: section.savingNewFeed,
            onclick: () => section.createFeed(),
          },
          section.translate('new_feed_add')
        ),
      ]),
    ]);
  }
}
