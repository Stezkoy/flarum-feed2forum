import Model from 'flarum/common/Model';

export default class Log extends Model {
  level() {
    return Model.attribute('level').call(this);
  }

  message() {
    return Model.attribute('message').call(this);
  }

  createdAt() {
    return Model.attribute('created_at', Model.transformDate).call(this);
  }
}
