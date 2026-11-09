import { Component, ElementRef, OnDestroy, computed, inject, output, signal, viewChild } from '@angular/core';
import { ApiFailure, StargateApiService, messageFrom } from './stargate-api.service';
import { PeoplePage, PersonRow, adaptPeoplePage, initials, pretty } from './adapters';
import { FailureComponent } from './failure.component';

type LoadedPage = Omit<PeoplePage, 'rows'> & { rows: PersonRow[] | null };
type Load = { state: 'loading' } | ({ state: 'ok'; raw: unknown } & LoadedPage) | { state: 'error'; failure: ApiFailure };
type Mut = { state: 'idle' } | { state: 'pending' } | { state: 'ok'; message: string } | { state: 'error'; failure: ApiFailure };

@Component({
  selector: 'sg-people',
  imports: [FailureComponent],
  template: `
  <div class="grid">
    <section class="roster card" aria-labelledby="roster-h">
      <header class="sec-head">
        <div>
          <h2 id="roster-h">Roster</h2>
        </div>
        @if (list().state === 'ok') {
          <button type="button" class="btn ghost sm" (click)="load()">Refresh</button>
        }
      </header>

      <div class="filter">
        <label class="sr-only" for="flt">Search people</label>
        <input id="flt" class="input" placeholder="Search names" [value]="filter()" (input)="onFilterInput($event)" />
        @if (list().state === 'ok') { <span class="count mono">{{ countText() }}</span> }
      </div>

      @switch (list().state) {
        @case ('loading') {
          <ul class="list" aria-busy="true">
            @for (i of [1,2,3,4,5]; track i) { <li class="sk"><span class="skel av"></span><span class="skel ln" [style.width.%]="40 + i * 9"></span></li> }
          </ul>
        }
        @case ('error') {
          @let l = list(); @if (l.state === 'error') { <sg-failure [failure]="l.failure" (retry)="load()" (setup)="setup.emit()" /> }
        }
        @case ('ok') {
          @if (list(); as l) {
            @if (l.state === 'ok') {
              @if (l.rows === null) {
                <div class="notice warn"><div><strong>Unrecognized response shape</strong>The request succeeded but the payload is not a paginated roster. Raw response preserved below.</div></div>
                <pre class="raw">{{ pretty(l.raw) }}</pre>
              } @else if (l.totalCount === 0 && !filter().trim()) {
                <div class="empty"><h3>The roster is empty</h3><p>The API answered with no people. Add the first person to get started.</p>
                  <button type="button" class="btn signal" (click)="openAdd()">Add Person</button>
                </div>
              } @else if (displayedRows().length === 0) {
                <div class="empty small"><h3>No matching people</h3><p>No name matches “{{ filter() }}”.</p>
                  <button type="button" class="btn signal" (click)="openAdd(filter().trim())">Add Person</button>
                </div>
              } @else {
                <ul class="list">
                  @for (p of displayedRows(); track p.name; let i = $index) {
                    <li class="person rise" [style.animation-delay.ms]="i * 25">
                      <span class="av" aria-hidden="true">{{ initials(p.name) }}</span>
                      <div class="who">
                        <span class="nm">{{ p.name }}</span>
                        @if (p.fields.length) {
                          <span class="meta mono">
                            @for (f of p.fields.slice(0, 3); track f.key) { <span>{{ f.label }}: {{ f.value }}</span> }
                          </span>
                        }
                      </div>
                      <div class="acts">
                        <button type="button" class="btn ghost sm" (click)="openDuty.emit(p.name)" [attr.aria-label]="'Duty history for ' + p.name">Duty history</button>
                        <button type="button" class="btn ghost sm" (click)="openRename(p.name)" [attr.aria-label]="'Rename ' + p.name">Rename</button>
                      </div>
                    </li>
                  }
                </ul>
              }
              @if (l.serverPaged) {
                <div class="pagination" aria-label="Roster pagination">
                  <span class="page-summary mono">
                    @if (l.totalCount > 0) { Showing {{ rangeStart() }}–{{ rangeEnd() }} of {{ l.totalCount }} } @else { 0 results }
                  </span>
                  <div class="page-controls">
                    <label class="sr-only" for="page-size">People per page</label>
                    <select id="page-size" class="input page-size" [value]="pageSize().toString()" (change)="setPageSize($event)">
                    @for (size of pageSizes; track size) { <option [value]="size.toString()" [selected]="size === pageSize()">{{ size }} / page</option> }
                    </select>
                    <button type="button" class="btn ghost sm" (click)="changePage(l.page - 1)" [disabled]="l.page <= 1 || l.totalPages === 0" aria-label="Previous page">Previous</button>
                    <span class="page-number mono">{{ l.totalPages > 0 ? 'Page ' + l.page + ' of ' + l.totalPages : 'No pages' }}</span>
                    <button type="button" class="btn ghost sm" (click)="changePage(l.page + 1)" [disabled]="l.page >= l.totalPages || l.totalPages === 0" aria-label="Next page">Next</button>
                  </div>
                  @if (l.pageSize !== pageSize()) {
                    <span class="page-summary mono">API returned {{ l.pageSize }} per page; {{ pageSize() }} requested.</span>
                  }
                </div>
              }
            } @else {
              <div class="notice warn"><div><strong>Roster is unavailable</strong>Retry the request to continue.</div></div>
            }
          }
        }
      }
    </section>

  </div>

  <dialog #addDlg class="dlg card" aria-labelledby="add-h" (close)="addState.set({ state: 'idle' })">
    <form (submit)="$event.preventDefault(); add()" novalidate>
      <h2 id="add-h">Add a person</h2>
      <div class="field">
        <label for="add-name">Full name</label>
        <input id="add-name" class="input" autocomplete="off" [value]="newName()" (input)="newName.set(val($event)); addTouched.set(true)"
          [attr.aria-invalid]="addTouched() && !!addProblem()" aria-describedby="add-msg" />
        <span id="add-msg" [class.problem]="addTouched() && addProblem()" [class.hint]="!(addTouched() && addProblem())">
          {{ addTouched() && addProblem() ? addProblem() : 'Sent as a JSON string body.' }}
        </span>
      </div>
      @let a = addState();
      @if (a.state === 'error') { <div class="mt"><sg-failure [failure]="a.failure" [retryable]="false" (setup)="closeAddAndSetup()" /></div> }
      <div class="dlg-acts">
        <button type="button" class="btn ghost" (click)="addDlg.close()">Cancel</button>
        <button class="btn signal" type="submit" [disabled]="!!addProblem() || a.state === 'pending'">
          {{ a.state === 'pending' ? 'Adding' : 'Add Person' }}
        </button>
      </div>
    </form>
  </dialog>

  <dialog #dlg class="dlg card" aria-labelledby="rn-h" (close)="renameState.set({ state: 'idle' })">
    <form (submit)="$event.preventDefault(); rename()" novalidate>
      <h2 id="rn-h">Rename person</h2>
      <p class="from">Current name <span class="mono">{{ renameFrom() }}</span></p>
      <div class="field">
        <label for="rn">New name</label>
        <input id="rn" class="input" autocomplete="off" [value]="renameTo()" (input)="renameTo.set(val($event))"
          [attr.aria-invalid]="!!renameProblem() && renameTo() !== ''" aria-describedby="rn-msg" />
        <span id="rn-msg" [class.problem]="renameProblem() && renameTo() !== ''" [class.hint]="!(renameProblem() && renameTo() !== '')">
          {{ renameProblem() && renameTo() !== '' ? renameProblem() : 'Duty history follows the person.' }}
        </span>
      </div>
      @let rs = renameState();
      @if (rs.state === 'error') { <div class="mt"><sg-failure [failure]="rs.failure" [retryable]="false" (setup)="closeAndSetup()" /></div> }
      <div class="dlg-acts">
        <button type="button" class="btn ghost" (click)="dlg.close()">Cancel</button>
        <button type="submit" class="btn" [disabled]="!!renameProblem() || rs.state === 'pending'">{{ rs.state === 'pending' ? 'Saving' : 'Save name' }}</button>
      </div>
    </form>
  </dialog>
  @if (toast(); as t) { <div class="toast rise" role="status">{{ t }}</div> }
  `,
  styles: `
    .grid { display: grid; grid-template-columns: minmax(0, 1fr); align-items: start; }
    .roster { padding: 20px; min-height: 420px; }
    .sec-head { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; margin-bottom: 14px; }
    .sec-head h2 { font-size: 26px; }
    .filter { display: flex; gap: 10px; align-items: center; margin-bottom: 12px; }
    .count { color: var(--muted); white-space: nowrap; }
    .pagination { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; padding-top: 14px; }
    .page-summary, .page-number { color: var(--muted); font-size: 12px; white-space: nowrap; }
    .page-controls { display: flex; align-items: center; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
    .page-size { width: auto; min-width: 112px; padding: 7px 10px; }
    @media (max-width: 600px) { .pagination { align-items: flex-start; } .page-controls { justify-content: flex-start; width: 100%; } }
    .list { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--rule); }
    .list li { display: flex; align-items: center; gap: 12px; padding: 12px 4px; border-bottom: 1px solid var(--rule); }
    .person { transition: background .15s; } .person:hover { background: var(--paper); }
    .sk .ln { height: 14px; }
    .av { width: 34px; height: 34px; flex: none; border-radius: 50%; display: grid; place-items: center; background: var(--orbit-soft); color: var(--orbit); font-family: var(--mono); font-size: 12px; font-weight: 500; }
    .who { flex: 1; min-width: 0; display: flex; flex-direction: column; }
    .nm { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .meta { color: var(--muted); display: flex; gap: 12px; flex-wrap: wrap; font-size: 11.5px; }
    .acts { display: flex; gap: 6px; flex-wrap: wrap; }
    .person .acts { opacity: .55; transition: opacity .15s; } .person:hover .acts, .person:focus-within .acts { opacity: 1; }
    @media (max-width: 600px) { .list li { flex-wrap: wrap; } .person .acts { opacity: 1; width: 100%; padding-left: 46px; } }
    .empty { text-align: center; padding: 48px 20px; color: var(--ink-2); display: flex; flex-direction: column; align-items: center; gap: 8px; }
    .empty.small { padding: 24px; }
    .empty h3 { font-size: 20px; } .empty p { max-width: 380px; margin: 0 0 8px; color: var(--muted); }
    .orbit { width: 72px; height: 72px; border: 1px dashed var(--rule-2); border-radius: 50%; position: relative; margin-bottom: 8px; animation: spin 14s linear infinite; }
    .orbit span { position: absolute; top: -5px; left: 31px; width: 10px; height: 10px; border-radius: 50%; background: var(--signal); }
    .orbit::after { content: ''; position: absolute; inset: 24px; border-radius: 50%; background: var(--ink); }
    @keyframes spin { to { transform: rotate(360deg); } }
    form { display: flex; flex-direction: column; gap: 14px; }
    form.inline { flex-direction: row; align-items: flex-end; gap: 10px; }
    .mt { margin-top: 14px; } .muted { color: var(--muted); }
    .dlg { padding: 24px; width: min(440px, calc(100vw - 32px)); border: 1px solid var(--rule); color: var(--ink); }
    .dlg::backdrop { background: rgba(20, 33, 58, .35); backdrop-filter: blur(2px); }
    .dlg[open] { animation: rise .25s ease both; }
    .dlg h2 { font-size: 22px; }
    .from { margin: 0; color: var(--ink-2); font-size: 13.5px; }
    .dlg-acts { display: flex; justify-content: flex-end; gap: 8px; }
    .toast { position: fixed; bottom: 20px; right: 20px; background: var(--ink); color: var(--paper); padding: 12px 16px; border-radius: 8px; font-size: 14px; box-shadow: var(--shadow); z-index: 10; border-left: 3px solid var(--signal); }
  `,
})
export class PeopleComponent implements OnDestroy {
  private api = inject(StargateApiService);
  openDuty = output<string>();
  setup = output<void>();
  dlg = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');
  addDlg = viewChild.required<ElementRef<HTMLDialogElement>>('addDlg');

  list = signal<Load>({ state: 'loading' });
  filter = signal('');
  newName = signal('');
  addTouched = signal(false);
  addState = signal<Mut>({ state: 'idle' });
  renameFrom = signal('');
  renameTo = signal('');
  renameState = signal<Mut>({ state: 'idle' });
  toast = signal<string | null>(null);
  pageSizes = [10, 25, 50];
  page = signal(1);
  pageSize = signal(10);
  private requestSequence = 0;
  private searchTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    this.load();
  }

  filtered = computed(() => {
    const q = this.filter().trim().toLowerCase();
    const l = this.list();
    return l.state === 'ok' && !l.serverPaged
      ? (l.rows ?? []).filter((r) => !q || r.name.toLowerCase().includes(q))
      : l.state === 'ok' ? l.rows ?? [] : [];
  });
  displayedRows = computed(() => this.filtered());
  countText = computed(() => {
    const l = this.list();
    if (l.state !== 'ok') return '';
    if (l.rows === null) return 'Unrecognized response';
    if (l.serverPaged) return `${l.totalCount} ${l.totalCount === 1 ? 'person' : 'people'}`;
    return `${this.filtered().length} / ${l.totalCount}`;
  });
  rangeStart = computed(() => {
    const l = this.list();
    return l.state === 'ok' ? (l.totalCount === 0 ? 0 : (l.page - 1) * l.pageSize + 1) : 0;
  });
  rangeEnd = computed(() => {
    const l = this.list();
    return l.state === 'ok' ? Math.min(l.page * l.pageSize, l.totalCount) : 0;
  });
  addProblem = computed(() => nameProblem(this.newName()));
  renameProblem = computed(() => {
    const p = nameProblem(this.renameTo());
    if (p) return p;
    return this.renameTo().trim() === this.renameFrom() ? 'The new name matches the current name.' : null;
  });

  initials = initials; pretty = pretty;
  val(e: Event) { return (e.target as HTMLInputElement).value; }

  onFilterInput(e: Event) {
    this.filter.set(this.val(e));
    this.requestSequence++;
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.setCurrentPage(1);
      this.load();
    }, 300);
  }

  load() {
    clearTimeout(this.searchTimer);
    const sequence = ++this.requestSequence;
    const current = this.list();
    const page = current.state === 'ok' && !current.serverPaged ? 1 : this.currentPage();
    this.page.set(page);
    this.list.set({ state: 'loading' });
    this.api.listPeople({ page, pageSize: this.pageSize(), search: this.filter().trim() }).subscribe({
      next: (raw) => {
        if (sequence !== this.requestSequence) return;
        const result = adaptPeoplePage(raw, page, this.pageSize());
        if (!result) {
          this.list.set({ state: 'ok', raw, rows: null, page, pageSize: this.pageSize(), totalCount: 0, totalPages: 0, serverPaged: false });
          return;
        }
        this.page.set(result.page);
        this.list.set({ state: 'ok', raw, ...result });
      },
      error: (failure: ApiFailure) => {
        if (sequence === this.requestSequence) this.list.set({ state: 'error', failure });
      },
    });
  }

  private currentPage() { return this.page(); }
  private setCurrentPage(value: number) { this.page.set(value); }

  changePage(value: number) {
    const current = this.list();
    if (current.state !== 'ok' || value < 1 || value > current.totalPages || value === current.page) return;
    this.page.set(value);
    this.load();
  }

  setPageSize(e: Event) {
    const value = Number((e.target as HTMLSelectElement).value);
    if (!this.pageSizes.includes(value)) return;
    this.pageSize.set(value);
    this.page.set(1);
    this.load();
  }

  openAdd(prefill = '') {
    this.newName.set(prefill);
    this.addTouched.set(false);
    this.addState.set({ state: 'idle' });
    this.addDlg().nativeElement.showModal();
  }

  add() {
    this.addTouched.set(true);
    if (this.addProblem()) return;
    const n = this.newName().trim();
    this.addState.set({ state: 'pending' });
    this.api.createPerson(n).subscribe({
      next: (raw) => {
        const message = messageFrom(raw) ?? `${n} was added to the roster.`;
        this.addState.set({ state: 'ok', message });
        this.newName.set(''); this.addTouched.set(false);
        this.addDlg().nativeElement.close();
        this.flash(message);
        this.filter.set('');
        this.page.set(1);
        this.load();
      },
      error: (failure: ApiFailure) => this.addState.set({ state: 'error', failure }),
    });
  }

  openRename(name: string) {
    this.renameFrom.set(name); this.renameTo.set(name);
    this.renameState.set({ state: 'idle' });
    this.dlg().nativeElement.showModal();
  }

  rename() {
    if (this.renameProblem()) return;
    const from = this.renameFrom(), to = this.renameTo().trim();
    this.renameState.set({ state: 'pending' });
    this.api.renamePerson(from, to).subscribe({
      next: (raw) => {
        this.dlg().nativeElement.close();
        this.flash(messageFrom(raw) ?? `Renamed ${from} to ${to}.`);
        this.load();
      },
      error: (failure: ApiFailure) => this.renameState.set({ state: 'error', failure }),
    });
  }

  closeAndSetup() { this.dlg().nativeElement.close(); this.setup.emit(); }
  closeAddAndSetup() { this.addDlg().nativeElement.close(); this.setup.emit(); }

  private timer: ReturnType<typeof setTimeout> | undefined;
  private flash(msg: string) {
    this.toast.set(msg);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.toast.set(null), 3600);
  }

  ngOnDestroy() {
    clearTimeout(this.searchTimer);
    clearTimeout(this.timer);
    this.requestSequence++;
  }

}

function nameProblem(v: string): string | null {
  const t = v.trim();
  if (!t) return 'A name is required.';
  if (t.length > 120) return 'Keep names under 120 characters.';
  return null;
}
