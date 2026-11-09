import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { ApiFailure, StargateApiService, messageFrom } from './stargate-api.service';
import { PersonRow, RecordTable, adaptDuties, humanize, initials, localToIso, pretty } from './adapters';
import { FailureComponent } from './failure.component';

type Hist = { state: 'idle' } | { state: 'loading'; name: string }
  | { state: 'ok'; name: string; raw: unknown; parsed: { person: PersonRow | null; table: RecordTable } | null }
  | { state: 'error'; name: string; failure: ApiFailure };
type Mut = { state: 'idle' } | { state: 'pending' } | { state: 'ok'; message: string } | { state: 'error'; failure: ApiFailure };

@Component({
  selector: 'sg-duty',
  imports: [FailureComponent],
  template: `
  <div class="grid">
    <section class="card pad" aria-labelledby="h-h">
      <h2 id="h-h">Duty history</h2>
      <form class="inline" (submit)="$event.preventDefault(); find(query())">
        <div class="field grow">
          <label for="q">Person name</label>
          <input id="q" class="input" autocomplete="off" [value]="query()" (input)="query.set(val($event))" />
        </div>
        <button class="btn" type="submit" [disabled]="!query().trim() || hist().state === 'loading'">{{ hist().state === 'loading' ? 'Searching' : 'Find history' }}</button>
      </form>

      @let h = hist();
      @switch (h.state) {
        @case ('idle') {
          <div class="empty">
            <div class="track" aria-hidden="true"><i></i><i></i><i></i></div>
            <h3>No person selected</h3>
            <p>Enter a name to read their assignments in order. You can also jump here from the roster.</p>
          </div>
        }
        @case ('loading') {
          <div class="tl" aria-busy="true">@for (i of [1,2,3]; track i) { <div class="skel" style="height:58px;margin:10px 0"></div> }</div>
        }
        @case ('error') { @if (h.state === 'error') { <div class="mt"><sg-failure [failure]="h.failure" (retry)="find(h.name)" (setup)="setup.emit()" /></div> } }
        @case ('ok') {
          @if (h.state === 'ok') {
            @if (h.parsed; as p) {
              @if (p.person; as per) {
                <div class="who rise">
                  <span class="av">{{ initials(per.name) }}</span>
                  <div><strong>{{ per.name }}</strong>
                    <div class="chips">@for (f of per.fields; track f.key) { <span class="chip mono">{{ f.label }} <b>{{ f.value }}</b></span> }</div>
                  </div>
                </div>
              }
              @if (p.table.rows.length === 0) {
                <div class="empty small"><h3>No duty assignment history</h3></div>
              } @else {
                <ol class="tl">
                  @for (r of p.table.rows; track $index; let i = $index) {
                    <li class="rise" [style.animation-delay.ms]="i * 40">
                      <span class="dot" [class.current]="isCurrent(r)" aria-hidden="true"></span>
                      <div class="duty">
                        <div class="dt">
                          <strong>{{ r['dutyTitle'] || 'Assignment ' + (i + 1) }}</strong>
                          @if (r['rank']) { <span class="rank mono">{{ r['rank'] }}</span> }
                          @if (isCurrent(r)) { <span class="cur mono">current</span> }
                        </div>
                        <div class="dmeta mono">
                          @for (c of extraCols(p.table); track c) { <span>{{ humanize(c) }} {{ r[c] }}</span> }
                        </div>
                      </div>
                    </li>
                  }
                </ol>
              }
            } @else {
              <div class="notice warn mt"><div><strong>Unrecognized response shape</strong>The request succeeded; raw response preserved.</div></div>
              <pre class="raw mt">{{ pretty(h.raw) }}</pre>
            }
          }
        }
      }
    </section>

    <section class="card pad" aria-labelledby="c-h">
      <h2 id="c-h">Log a duty</h2>
      <form (submit)="$event.preventDefault(); create()" novalidate>
        @for (f of fields; track f.key) {
          <div class="field">
            <label [for]="'d-' + f.key">{{ f.label }}</label>
            <input [id]="'d-' + f.key" class="input" autocomplete="off" [value]="form()[f.key]" (input)="set(f.key, val($event))"
              [attr.aria-invalid]="touched() && !form()[f.key].trim()" [attr.aria-describedby]="'d-' + f.key + '-m'" [placeholder]="f.ph" />
            @if (touched() && !form()[f.key].trim()) { <span class="problem" [id]="'d-' + f.key + '-m'">{{ f.label }} is required.</span> }
          </div>
        }
        <div class="field">
          <label for="d-start">Start date</label>
          <input id="d-start" type="datetime-local" class="input" [value]="start()" (input)="start.set(val($event))" aria-describedby="d-start-m" />
        </div>
        <button class="btn signal" type="submit" [disabled]="(touched() && !valid()) || cs().state === 'pending'">{{ cs().state === 'pending' ? 'Saving' : 'Log duty' }}</button>
      </form>
      @let c = cs();
      @if (c.state === 'ok') { <div class="notice ok mt" role="status">{{ c.message }}</div> }
      @if (c.state === 'error') { <div class="mt"><sg-failure [failure]="c.failure" [retryable]="false" (setup)="setup.emit()" /></div> }
    </section>
  </div>
  `,
  styles: `
    .grid { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr); gap: 20px; align-items: start; }
    @media (max-width: 900px) { .grid { grid-template-columns: 1fr; } }
    .pad { padding: 20px; } h2 { font-size: 24px; margin-bottom: 14px; }
    form { display: flex; flex-direction: column; gap: 14px; }
    form.inline { flex-direction: row; align-items: flex-end; gap: 10px; }
    .grow { flex: 1; } .mt { margin-top: 14px; }
    .opt { font-weight: 400; color: var(--muted); font-family: var(--mono); font-size: 11px; margin-left: 4px; }
    .empty { text-align: center; padding: 44px 20px; display: flex; flex-direction: column; align-items: center; gap: 6px; }
    .empty.small { padding: 24px; } .empty h3 { font-size: 19px; } .empty p { margin: 0; color: var(--muted); max-width: 360px; }
    .track { display: flex; gap: 22px; margin-bottom: 10px; position: relative; }
    .track::before { content: ''; position: absolute; left: 0; right: 0; top: 50%; border-top: 1px dashed var(--rule-2); }
    .track i { width: 12px; height: 12px; border-radius: 50%; background: var(--card); border: 2px solid var(--orbit); position: relative; }
    .track i:last-child { border-color: var(--signal); background: var(--signal); }
    .who { display: flex; gap: 12px; align-items: flex-start; margin-top: 18px; padding: 14px; background: var(--paper); border-radius: 8px; border: 1px solid var(--rule); }
    .av { width: 40px; height: 40px; flex: none; border-radius: 50%; background: var(--ink); color: var(--paper); display: grid; place-items: center; font-family: var(--mono); font-size: 13px; }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
    .chip { font-size: 11px; padding: 2px 8px; border-radius: 99px; background: var(--card); border: 1px solid var(--rule); color: var(--muted); }
    .chip b { color: var(--ink); font-weight: 500; }
    .tl { list-style: none; margin: 18px 0 0; padding: 0 0 0 6px; }
    ol.tl li { position: relative; padding: 0 0 18px 26px; border-left: 1px solid var(--rule-2); }
    ol.tl li:last-child { border-left-color: transparent; }
    .dot { position: absolute; left: -7px; top: 4px; width: 13px; height: 13px; border-radius: 50%; background: var(--card); border: 2px solid var(--orbit); }
    .dot.current { background: var(--signal); border-color: var(--signal); box-shadow: 0 0 0 4px var(--signal-soft); }
    .dt { display: flex; flex-wrap: wrap; gap: 8px; align-items: baseline; }
    .rank { font-size: 11px; padding: 1px 7px; border-radius: 4px; background: var(--orbit-soft); color: var(--orbit); }
    .cur { font-size: 11px; color: var(--signal); }
    .dmeta { display: flex; flex-wrap: wrap; gap: 4px 14px; color: var(--muted); font-size: 11.5px; margin-top: 2px; }
  `,
})
export class DutyComponent {
  private api = inject(StargateApiService);
  preset = input<{ name: string; n: number } | null>(null);
  setup = output<void>();

  query = signal('');
  hist = signal<Hist>({ state: 'idle' });
  form = signal<Record<'name' | 'rank' | 'dutyTitle', string>>({ name: '', rank: '', dutyTitle: '' });
  start = signal('');
  touched = signal(false);
  cs = signal<Mut>({ state: 'idle' });
  valid = computed(() => Object.values(this.form()).every((v) => v.trim()));

  fields = [
    { key: 'name' as const, label: 'Person name', ph: 'Exact name on the roster' },
    { key: 'rank' as const, label: 'Rank', ph: 'e.g. 1LT' },
    { key: 'dutyTitle' as const, label: 'Duty title', ph: 'e.g. Commander' },
  ];
  initials = initials; pretty = pretty; humanize = humanize;
  private hidden = ['dutyTitle', 'rank', 'id', 'personId'];

  constructor() {
    effect(() => {
      const p = this.preset();
      if (p) { this.find(p.name); this.form.update((f) => ({ ...f, name: p.name })); }
    });
  }

  val(e: Event) { return (e.target as HTMLInputElement).value; }
  set(k: 'name' | 'rank' | 'dutyTitle', v: string) { this.form.update((f) => ({ ...f, [k]: v })); }
  extraCols(t: RecordTable) { return t.columns.filter((c) => !this.hidden.includes(c)); }
  isCurrent(r: Record<string, string>) { return 'dutyEndDate' in r && r['dutyEndDate'] === '—'; }

  find(name: string) {
    const n = name.trim();
    if (!n) return;
    this.query.set(n);
    this.hist.set({ state: 'loading', name: n });
    this.api.getDuties(n).subscribe({
      next: (raw) => this.hist.set({ state: 'ok', name: n, raw, parsed: adaptDuties(raw) }),
      error: (failure: ApiFailure) => this.hist.set({ state: 'error', name: n, failure }),
    });
  }

  create() {
    this.touched.set(true);
    if (!this.valid()) return;
    const f = this.form();
    const name = f.name.trim();
    this.cs.set({ state: 'pending' });
    this.api.createDuty({ name, rank: f.rank.trim(), dutyTitle: f.dutyTitle.trim(), dutyStartDate: localToIso(this.start()) }).subscribe({
      next: (raw) => {
        this.cs.set({ state: 'ok', message: messageFrom(raw) ?? `Duty logged for ${name}.` });
        this.form.set({ name, rank: '', dutyTitle: '' });
        this.start.set(''); this.touched.set(false);
        this.find(name);
      },
      error: (failure: ApiFailure) => this.cs.set({ state: 'error', failure }),
    });
  }
}
