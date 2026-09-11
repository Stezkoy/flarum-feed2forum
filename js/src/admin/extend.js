import Extend from 'flarum/common/extenders';
import Feed from './models/Feed';
import Item from './models/Item';
import FeedSettingsPage from './components/FeedSettingsPage';

export default [
  new Extend.Store().add('feed2forum-feeds', Feed),
  new Extend.Store().add('feed2forum-items', Item),

  new Extend.Admin().page(FeedSettingsPage),
];