import { Component, inject, signal } from '@angular/core';
import { StargateApiService } from './stargate-api.service';
import { PeopleComponent } from './people.component';
import { DutyComponent } from './duty.component';

type Tab = 'people' | 'duty';

@Component({
  selector: 'sg-root',
  imports: [PeopleComponent, DutyComponent],
  template: `
  <div class="shell">
    <header class="top">
      <div class="brand">
        <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true"><circle cx="15" cy="15" r="13" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="15" cy="15" r="5" fill="currentColor"/><circle cx="26" cy="9" r="3" fill="var(--signal)"/></svg>
        <div><h1>Stargate</h1><span class="eyebrow">Personnel &amp; duty console</span></div>
      </div>
      <div class="status" [attr.data-s]="api.connection()" role="status" aria-live="polite">
        <span class="led" aria-hidden="true"></span>
        <span class="mono">{{ label() }}</span>
      </div>
    </header>

    <nav class="tabs" role="tablist" aria-label="Sections">
      @for (t of tabs; track t.id) {
        <button role="tab" type="button" [id]="'tab-' + t.id" [attr.aria-selected]="tab() === t.id" [attr.aria-controls]="'panel-' + t.id"
          [tabindex]="tab() === t.id ? 0 : -1" (click)="navigate(t.id)" (keydown)="key($event)">
          <span class="mono n">{{ t.n }}</span>{{ t.label }}
        </button>
      }
    </nav>

    <main>
      <div role="tabpanel" id="panel-people" aria-labelledby="tab-people" [hidden]="tab() !== 'people'">
        <sg-people (openDuty)="goDuty($event)"/>
      </div>
      <div role="tabpanel" id="panel-duty" aria-labelledby="tab-duty" [hidden]="tab() !== 'duty'">
        <sg-duty [preset]="preset()"/>
      </div>
    </main>
  </div>
  `,
  styles: `
    .shell { position: relative; z-index: 1; max-width: 1180px; margin: 0 auto; padding: 28px 24px 40px; min-height: 100dvh; display: flex; flex-direction: column; }
    @media (max-width: 600px) { .shell { padding: 18px 14px 28px; } }
    .top { display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: wrap; }
    .brand { display: flex; gap: 12px; align-items: center; color: var(--ink); }
    h1 { font-size: 28px; line-height: 1; font-weight: 700; }
    .status { display: inline-flex; align-items: center; gap: 8px; padding: 6px 12px; border-radius: 99px; border: 1px solid var(--rule-2); background: var(--card); font-size: 12px; }
    .led { width: 8px; height: 8px; border-radius: 50%; background: var(--muted); }
    .status[data-s='online'] .led { background: var(--ok); box-shadow: 0 0 0 3px var(--ok-soft); }
    .status[data-s='offline'] .led { background: var(--err); box-shadow: 0 0 0 3px var(--err-soft); }
    .tabs { display: flex; gap: 4px; margin: 26px 0 22px; border-bottom: 1px solid var(--rule-2); overflow-x: auto; scrollbar-width: none; -ms-overflow-style: none; }
    .tabs::-webkit-scrollbar { display: none; }
    .tabs button { background: none; border: 0; padding: 10px 14px; cursor: pointer; font-weight: 600; color: var(--muted); position: relative; display: flex; gap: 8px; align-items: baseline; white-space: nowrap; transition: color .15s; }
    .tabs button:hover { color: var(--ink); }
    .tabs button::after { content: ''; position: absolute; left: 10px; right: 10px; bottom: -1px; height: 2px; background: var(--signal); transform: scaleX(0); transition: transform .2s ease; }
    .tabs button[aria-selected='true'] { color: var(--ink); }
    .tabs button[aria-selected='true']::after { transform: scaleX(1); }
    .n { font-size: 10.5px; color: var(--signal); }
    main { flex: 1; }
    footer { margin-top: 32px; color: var(--muted); font-size: 11.5px; }
  `,
})
export class AppComponent {
  api = inject(StargateApiService);
  tab = signal<Tab>('people');
  preset = signal<{ name: string; n: number } | null>(null);
  tabs: { id: Tab; label: string; n: string }[] = [
    { id: 'people', label: 'People', n: '01' },
    { id: 'duty', label: 'Duty history', n: '02' }
  ];

  constructor() {
    this.restoreRoute();
    window.addEventListener('popstate', this.onPopState);

    if (window.location.pathname === '/') {
      window.history.replaceState({ stargateTab: 'people' }, '', '/people');
    }
  }

  private onPopState = () => this.restoreRoute();

  navigate(next: Tab, name?: string) {
    const url = new URL(window.location.href);
    const nextPath = next === 'people' ? '/people' : next === 'duty' ? '/duty' : '/connection';
    if (name) url.searchParams.set('name', name);
    else url.searchParams.delete('name');

    const nextUrl = `${nextPath}${url.search}`;
    const currentName = new URLSearchParams(window.location.search).get('name');
    if (this.tab() === next && (name ?? null) === (next === 'duty' ? currentName : null)) return;

    window.history.pushState({ stargateTab: next, name: name ?? null }, '', nextUrl);
    this.tab.set(next);
    this.preset.set(name ? { name, n: Date.now() } : null);
  }

  private restoreRoute() {
    const segments = window.location.pathname.split('/').filter(Boolean);
    const route = segments[0];
    const next: Tab =
      route === 'duty' ? 'duty' :
      route === 'people' || route === undefined ? 'people' : 'people';
    const name = next === 'duty' ? new URLSearchParams(window.location.search).get('name') : null;

    this.tab.set(next);
    this.preset.set(name ? { name, n: Date.now() } : null);
  }

  label() {
    const s = this.api.connection();
    const t = this.api.lastContact();
    if (s === 'online') return `API online${t ? ' · ' + t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}`;
    if (s === 'offline') return 'API unreachable';
    return 'Not contacted yet';
  }

  goDuty(name: string) {
    this.navigate('duty', name);
  }

  key(e: KeyboardEvent) {
    const ids = this.tabs.map((t) => t.id);
    const i = ids.indexOf(this.tab());
    let next = -1;
    if (e.key === 'ArrowRight') next = (i + 1) % ids.length;
    else if (e.key === 'ArrowLeft') next = (i - 1 + ids.length) % ids.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = ids.length - 1;
    if (next < 0) return;
    e.preventDefault();
    this.navigate(ids[next]);
    document.getElementById('tab-' + ids[next])?.focus();
  }
}
