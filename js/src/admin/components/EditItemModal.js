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

    // NOTE: Flarum's Modal reserves the method names title()/content() —
    // state properties must NOT use those names (shadowing them kills the
    // modal with "this.title is not a function").
    this.hasContentEdit = this.item.editedContent() != null;
    this.editTitle = this.item.editedTitle() ?? this.item.title() ?? '';
    this.editContent = this.item.editedContent() ?? '';

    // The original (feed version, composed post text) is only serialized on
    // Show — always fetch it once so "Reset to original" restores it into
    // the fields immediately and Save can tell "no changes" from a real edit.
    this.loading = true;

    app.store
      .find('feed2forum-items', String(this.item.id()))
      .then((fresh) => {
        this.item = fresh;
        this.originalTitle = fresh.title() ?? '';
        this.originalContent = fresh.composedContent() ?? '';

        if (!this.hasContentEdit) {
          this.editContent = this.originalContent;
        }
      })
      .catch(() => app.alerts.show({ type: 'error' }, app.translator.trans(`${PREFIX}.admin.settings.edit_load_error`)))
      .finally(() => {
        this.loading = false;
        m.redraw();
      });
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

    const title = this.editTitle.trim();
    const content = this.editContent.trim();

    // "Identical to the feed version" means no edit: send nulls so the
    // overrides are cleared and the Edited badge disappears.
    const sameTitle = title === (this.originalTitle ?? '').trim() || title === (this.item.title() ?? '').trim();
    const sameContent = content === (this.originalContent ?? '').trim();

    this.item
      .save({
        edited_title: sameTitle ? null : title || null,
        edited_content: sameContent ? null : content || null,
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
    // Restore the feed version into the fields right away (no server round
    // trip — originalTitle/originalContent were prefetched on init). The
    // user still presses Save to persist the revert.
    this.editTitle = this.originalTitle ?? this.item.title() ?? '';
    this.editContent = this.originalContent ?? '';
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
                value: this.editTitle,
                oninput: (e) => {
                  this.editTitle = e.target.value;
                },
              }),
            ]),
            m('.Form-group', [
              m('label', app.translator.trans(`${PREFIX}.admin.settings.edit_content_label`)),
              m('p.helpText', app.translator.trans(`${PREFIX}.admin.settings.edit_content_help`)),
              m('textarea.FormControl.Feed2forumEditContent', {
                value: this.editContent,
                oninput: (e) => {
                  this.editContent = e.target.value;
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
