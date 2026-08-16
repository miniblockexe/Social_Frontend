import { Pipe, PipeTransform } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

/**
 * Pipe linkify — detect URLs trong text và wrap thành <a> mở tab mới.
 */
@Pipe({ name: 'linkify', standalone: true })
export class LinkifyPipe implements PipeTransform {
  private static readonly URL_REGEX =
    /((https?|ftp):\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]])/gi;

  constructor(private readonly sanitizer: DomSanitizer) {}

  transform(value: string | null | undefined): SafeHtml {
    if (!value) return '';

    const escaped = value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/\n/g, '<br>');

    const linked = escaped.replace(
      LinkifyPipe.URL_REGEX,
      (url) =>
        `<a href="${url}" target="_blank" rel="noopener noreferrer" class="app-link">${url}</a>`,
    );

    return this.sanitizer.bypassSecurityTrustHtml(linked);
  }
}
