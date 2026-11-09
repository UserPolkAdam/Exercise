import { Component, input, output } from '@angular/core';
import { ApiFailure } from './stargate-api.service';
import { pretty } from './adapters';

@Component({
  selector: 'sg-failure',
  template: `
    @let f = failure();
    <div class="notice" [class.err]="f.kind === 'http'" [class.warn]="f.kind !== 'http'" role="alert">
      <div class="glyph" aria-hidden="true">{{ f.kind === 'http' ? f.status : '//' }}</div>
      <div class="body">
        <strong>{{ f.title }}</strong>
        <span>{{ f.detail }}</span>
        <div class="row">
          @if (retryable()) { <button type="button" class="btn ghost sm" (click)="retry.emit()">Retry</button> }
          @if (f.kind !== 'http') { <button type="button" class="btn ghost sm" (click)="setup.emit()">Connection setup</button> }
          @if (f.body) {
            <details><summary class="mono">response body</summary><pre class="raw">{{ pretty(f.body) }}</pre></details>
          }
        </div>
      </div>
    </div>
  `,
  styles: `
    .notice { align-items: flex-start; }
    .glyph { font-family: var(--mono); font-weight: 500; font-size: 12px; padding: 2px 6px; border: 1px solid currentColor; border-radius: 4px; opacity: .8; }
    .body { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
    .row { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; align-items: center; }
    details { width: 100%; } summary { cursor: pointer; font-size: 12px; }
    pre { margin-top: 6px !important; }
  `,
})
export class FailureComponent {
  failure = input.required<ApiFailure>();
  retryable = input(true);
  retry = output<void>();
  setup = output<void>();
  pretty = pretty;
}
