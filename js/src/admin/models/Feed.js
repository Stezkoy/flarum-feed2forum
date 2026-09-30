import Model from 'flarum/common/Model';

export default class Feed extends Model {
  url() {
    return Model.attribute('url').call(this);
  }

  title() {
    return Model.attribute('title').call(this);
  }

  tagId() {
    return Model.attribute('tag_id').call(this);
  }

  secondaryTagId() {
    return Model.attribute('secondary_tag_id').call(this);
  }

  publishLimit() {
    return Model.attribute('publish_limit').call(this);
  }

  publishMode() {
    return Model.attribute('publish_mode').call(this);
  }

  status() {
    return Model.attribute('status').call(this);
  }

  skippedCount() {
    return Model.attribute('skipped_count').call(this);
  }

  tag() {
    return Model.hasOne('tag').call(this);
  }

  secondaryTag() {
    return Model.hasOne('secondaryTag').call(this);
  }

  createdAt() {
    return Model.attribute('created_at', Model.transformDate).call(this);
  }
}
