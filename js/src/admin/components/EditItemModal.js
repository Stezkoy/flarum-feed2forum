import app from 'flarum/admin/app';
import Modal from 'flarum/common/components/Modal';
import Button from 'flarum/common/components/Button';
import LoadingIndicator from 'flarum/common/components/LoadingIndicator';

const PREFIX = 'stezkoy-feed2forum';

/**
 * Edit a queued item before publishing: the title and the exact post text
 * (converted body + source link when enabled). Edits are stored in
 * edited_title/edited_content and win over the feed data at publish time;
 * "reset" clears them so the item publishes from the feed again.
 */
export default class EditItemModal extends Modal {
  oninit(vnode) {
    super.oninit(vnode);

    this.item = this.attrs.item;
    this.saving = false;

    this.title = this.item.editedTitle() ?? this.item.title() ?? '';
    this.content = this.item.editedContent() ?? '';
    this.loadedComposed = this.item.editedContent() != null;

    // The converted post text is only serialized on Show — fetch the fresh
    // item so the dialog shows what would be posted right now.
    if (!this.loadedComposed) {
      this.loading = true;

      app.store
        .find('feed2forum-items', String(this.item.id()))
        .then((fresh) => {
          this.item = fresh;
          this.content = fresh.composedContent() ?? '';
        })
        .catch(() => app.alerts.show({ type: 'error' }, app.translator.trans(`${PREFIX}.admin.settings.edit_load_error`)))
        .finally(() => {
          this.loading = false;
          m.redraw();
        });
    }
  }

  className() {
    return 'Feed2forumEditModal Modal--large';
  }

  title() {
    return app.translator.trans(`${PREFIX}.admin.settings.edit_heading`);
  }

  save() {
    if (this.saving) return;

    this.saving = true;

    this.item
      .save({
        edited_title: this.title.trim() || null,
        edited_content: this.content.trim() || null,
      })
      .then(() => {
        app.alerts.show({ type: 'success' }, app.translator.trans(`${PREFIX}.admin.settings.edit_saved`));

        if (this.attrs.onSaved) this.attrs.onSaved();

        this.hide();
      })
      .catch(() => app.alerts.show({ type: 'error' }, app.translator.trans(`${PREFIX}.admin.settings.edit_error`)))
      .finally(() => {
        this.saving = false;
        m.redraw();
      });
  }

  reset() {
    this.title = this.item.title() ?? '';
    this.content = '';
  }

  content() {
    return m('.Modal-body.Feed2forumEditBody', [
      this.loading
        ? m(LoadingIndicator, { display: 'block' })
        : [
            m('.Form-group', [
              m('label', app.translator.trans(`${PREFIX}.admin.settings.edit_title_label`)),
              m('input.FormControl', {
                type: 'text',
                value: this.title,
                oninput: (e) => {
                  this.title = e.target.value;
                },
              }),
            ]),
            m('.Form-group', [
              m('label', app.translator.trans(`${PREFIX}.admin.settings.edit_content_label`)),
              m('p.helpText', app.translator.trans(`${PREFIX}.admin.settings.edit_content_help`)),
              m('textarea.FormControl.Feed2forumEditContent', {
                value: this.content,
                oninput: (e) => {
                  this.content = e.target.value;
                },
              }),
            ]),
            m('.Form-group.Form-controls.Feed2forumEditControls', [
              m(
                Button,
                {
                  className: 'Button',
                  icon: 'fas fa-rotate-left',
                  onclick: () => this.reset(),
                },
                app.translator.trans(`${PREFIX}.admin.settings.edit_reset`)
              ),
              m(
                Button,
                {
                  className: 'Button Button--primary',
                  loading: this.saving,
                  disabled: this.saving,
                  onclick: () => this.save(),
                },
                app.translator.trans(`${PREFIX}.admin.settings.edit_save`)
              ),
            ]),
          ],
    ]);
  }
}
