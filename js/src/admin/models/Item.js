import Model from 'flarum/common/Model';

export default class Item extends Model {
  title() {
    return Model.attribute('title').call(this);
  }

  link() {
    return Model.attribute('link').call(this);
  }

  status() {
    return Model.attribute('status').call(this);
  }

  wasDeleted() {
    return Model.attribute('was_deleted').call(this);
  }

  editedTitle() {
    return Model.attribute('edited_title').call(this);
  }

  editedContent() {
    return Model.attribute('edited_content').call(this);
  }

  composedContent() {
    return Model.attribute('composed_content').call(this);
  }

  discussionId() {
    return Model.attribute('discussion_id').call(this);
  }

  publishedAt() {
    return Model.attribute('published_at', Model.transformDate).call(this);
  }

  feed() {
    return Model.hasOne('feed').call(this);
  }
}
