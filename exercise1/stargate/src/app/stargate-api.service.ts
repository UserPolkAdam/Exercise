import { HttpClient, HttpErrorResponse, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, TimeoutError, catchError, tap, throwError, timeout } from 'rxjs';

/** Same-origin prefix; Angular CLI proxy (proxy.conf.json) strips it and forwards to the local API. */
export const API_PREFIX = '/stargate-api';
export const REQUEST_TIMEOUT_MS = 12000;

export type ConnectionState = 'unknown' | 'online' | 'offline';

export interface ApiFailure {
  kind: 'timeout' | 'unreachable' | 'http';
  status: number;
  title: string;
  detail: string;
  body: unknown;
}

export interface CreateDutyInput {
  name: string;
  rank: string;
  dutyTitle: string;
  /** ISO 8601 string; omitted when blank. */
  dutyStartDate?: string;
}

const enc = (s: string) => encodeURIComponent(s);

export interface PeopleQuery {
  page: number;
  pageSize: number;
  search?: string;
}

@Injectable({ providedIn: 'root' })
export class StargateApiService {
  private http = inject(HttpClient);
  readonly connection = signal<ConnectionState>('unknown');
  readonly lastContact = signal<Date | null>(null);

  listPeople(query: PeopleQuery): Observable<unknown> {
    let params = new HttpParams()
      .set('page', query.page)
      .set('pageSize', query.pageSize);
    if (query.search?.trim()) params = params.set('search', query.search.trim());
    return this.wrap(this.http.get<unknown>(`${API_PREFIX}/Person`, { params }));
  }
  getPerson(name: string): Observable<unknown> {
    return this.wrap(this.http.get<unknown>(`${API_PREFIX}/Person/${enc(name)}`));
  }
  /** Body is a bare JSON string per the spec, e.g. "Jane Doe". */
  createPerson(name: string): Observable<unknown> {
    return this.wrap(
      this.http.post<unknown>(`${API_PREFIX}/Person`, JSON.stringify(name), {
        headers: new HttpHeaders({ 'Content-Type': 'application/json' }),
      }),
    );
  }
  renamePerson(oldName: string, newName: string): Observable<unknown> {
    return this.wrap(this.http.patch<unknown>(`${API_PREFIX}/Person`, { oldName, newName }));
  }
  getDuties(name: string): Observable<unknown> {
    return this.wrap(this.http.get<unknown>(`${API_PREFIX}/AstronautDuty/${enc(name)}`));
  }
  createDuty(input: CreateDutyInput): Observable<unknown> {
    const body: Record<string, string> = { name: input.name, rank: input.rank, dutyTitle: input.dutyTitle };
    if (input.dutyStartDate) body['dutyStartDate'] = input.dutyStartDate;
    return this.wrap(this.http.post<unknown>(`${API_PREFIX}/AstronautDuty`, body));
  }

  private wrap<T>(req: Observable<T>): Observable<T> {
    return req.pipe(
      timeout(REQUEST_TIMEOUT_MS),
      tap(() => {
        this.connection.set('online');
        this.lastContact.set(new Date());
      }),
      catchError((err: unknown) => {
        const failure = toFailure(err);
        if (failure.kind === 'http') {
          this.connection.set('online');
          this.lastContact.set(new Date());
        } else {
          this.connection.set('offline');
        }
        return throwError(() => failure);
      }),
    );
  }
}

function toFailure(err: unknown): ApiFailure {
  if (err instanceof TimeoutError) {
    return {
      kind: 'timeout', status: 0, body: null,
      title: 'The Stargate API did not answer in time',
      detail: `No response after ${REQUEST_TIMEOUT_MS / 1000}s. Check that the API is running and that proxy.conf.json points at it.`,
    };
  }
  if (err instanceof HttpErrorResponse) {
    // Dev-server proxy reports 500/502/503/504 with no API body when the target is down.
    const proxyDown = err.status === 0 || ((err.status === 502 || err.status === 503 || err.status === 504 || err.status === 500) && !hasApiBody(err.error));
    if (proxyDown) {
      return {
        kind: 'unreachable', status: err.status, body: err.error ?? null,
        title: 'Cannot reach the Stargate API',
        detail: 'The local proxy could not connect to the API target. Start the API locally, then retry. See the Connection tab for setup.',
      };
    }
    return {
      kind: 'http', status: err.status, body: err.error ?? null,
      title: `The API rejected the request (${err.status}${err.statusText ? ' ' + err.statusText : ''})`,
      detail: messageFrom(err.error) ?? 'No message was included in the response.',
    };
  }
  return { kind: 'unreachable', status: 0, body: null, title: 'Unexpected client error', detail: String(err) };
}

function hasApiBody(body: unknown): boolean {
  if (body == null) return false;
  if (typeof body === 'string') return body.trim().startsWith('{') || body.trim().startsWith('[');
  return typeof body === 'object';
}

export function messageFrom(body: unknown): string | null {
  if (typeof body === 'string') return body.trim() || null;
  if (body && typeof body === 'object') {
    const r = body as Record<string, unknown>;
    for (const k of ['message', 'title', 'detail', 'error']) {
      if (typeof r[k] === 'string' && (r[k] as string).trim()) return r[k] as string;
    }
    if (r['errors'] && typeof r['errors'] === 'object') {
      const msgs = Object.values(r['errors'] as Record<string, unknown>).flat().filter((x) => typeof x === 'string');
      if (msgs.length) return msgs.join(' ');
    }
  }
  return null;
}
