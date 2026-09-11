import Extend from 'flarum/common/extenders';
import Feed from './models/Feed';
import Item from './models/Item';
import Feed2forumSettingsPage from './components/Feed2forumSettingsPage';

export default [
  new Extend.Store().add('feed2forum-feeds', Feed),
  new Extend.Store().add('feed2forum-items', Item),

  new Extend.Admin().page(Feed2forumSettingsPage),
];