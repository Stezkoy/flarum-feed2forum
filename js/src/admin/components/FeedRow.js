import Component from 'flarum/common/Component';
import Button from 'flarum/common/components/Button';
import Switch from 'flarum/common/components/Switch';
import withAttr from 'flarum/common/utils/withAttr';

/**
 * One row of the feeds table for an existing (saved) feed. Pure view: all
 * actions and state live in the FeedsTableSection coordinator passed via
 * attrs.section.
 */
export default class FeedRow extends Component {
  view(vnode) {
    const feed = this.attrs.feed;
    const section = this.attrs.section;

    return m('.Feed2forumTable-row', [
      m(
        '.Feed2forumTable-cell',
        m('input.FormControl', {
          type: 'text',
          value: feed.title() || '',
          oninput: withAttr('value', (v) => feed.pushAttributes({ title: v })),
          onblur: withAttr('value', (v) => section.updateFeed(feed, 'title', v.trim())),
        })
      ),
      m(
        '.Feed2forumTable-cell.Feed2forumTable-cell--grow',
        m('input.FormControl', {
          type: 'url',
          value: feed.url() || '',
          oninput: withAttr('value', (v) => feed.pushAttributes({ url: v })),
          onblur: withAttr('value', (v) => section.updateFeed(feed, 'url', v.trim())),
        })
      ),
      m('.Feed2forumTable-cell', section.tagSelect(feed)),
      m(
        '.Feed2forumTable-cell',
        m('input.FormControl', {
          type: 'number',
          min: '0',
          value: feed.publishLimit() != null ? feed.publishLimit() : '',
          oninput: withAttr('value', (v) => feed.pushAttributes({ publish_limit: v })),
          onblur: withAttr('value', (v) => section.updateFeed(feed, 'publish_limit', section.parseLimit(v))),
        })
      ),
      m('.Feed2forumTable-cell', section.publishModeSelect(feed)),
      m(
        '.Feed2forumTable-cell',
        m(Switch, {
          state: feed.status() === 'active',
          onchange: () => section.toggleFeedStatus(feed),
        })
      ),
      m('.Feed2forumTable-cell.Feed2forumTable-actions', [
        m(Button, {
          className: 'Button Button--icon',
          icon: 'fas fa-sync',
          loading: !!section.fetching[feed.id()],
          title: section.translate('fetch_tooltip'),
          onclick: () => section.fetchFeed(feed),
        }),
        m(Button, {
          className: 'Button Button--icon',
          icon: 'fas fa-eye',
          title: section.translate('preview_tooltip'),
          onclick: () => section.openPreviewModal(feed),
        }),
        m(Button, {
          className: 'Button Button--icon',
          icon: 'fas fa-trash',
          title: section.translate('feeds_delete_tooltip'),
          onclick: () => section.deleteFeed(feed),
        }),
      ]),
    ]);
  }
}
