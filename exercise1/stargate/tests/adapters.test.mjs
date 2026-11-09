import assert from 'node:assert/strict';
import { test } from 'node:test';
import { adaptDuties, adaptPerson, adaptPersonDuties } from '../src/app/adapters.ts';

const person = {
  personId: 9,
  name: 'Test Person',
  currentRank: '',
  currentDutyTitle: '',
  careerStartDate: null,
  careerEndDate: null,
};

test('recognizes a successful person-only duty response', () => {
  const result = adaptDuties({ person, success: true, message: 'Successful', responseCode: 200 });
  assert.equal(result?.person?.name, person.name);
  assert.deepEqual(result?.table, { columns: [], rows: [] });
  assert.equal(result?.person?.fields.find((field) => field.key === 'careerStartDate')?.value, '—');
});

test('keeps direct, envelope, and nested duty collections', () => {
  const duties = [{ dutyTitle: 'Pilot', rank: 'Captain' }];
  for (const response of [duties, { person, duties }, { person: { ...person, astronautDuties: duties } }]) {
    assert.equal(adaptDuties(response)?.table.rows[0]?.['dutyTitle'], 'Pilot');
  }
  assert.deepEqual(adaptDuties({ person, duties: [] })?.table.rows, []);
});

test('does not turn failed or malformed responses into empty histories', () => {
  for (const response of [
    { person, success: false },
    { person, duties: 'invalid' },
    { person, duties: [null] },
    { message: 'Successful', success: true },
    null,
  ]) {
    assert.equal(adaptDuties(response), null);
  }
});

test('person lookup preserves the person and its astronaut duty collection', () => {
  const response = {
    person: { personId: 1, name: 'John Doe' },
    astronautDuties: [{ id: 2, personId: 1, rank: '1LT', dutyTitle: 'Commander' }],
  };
  assert.equal(adaptPerson(response)?.name, 'John Doe');
  assert.deepEqual(adaptPersonDuties(response)?.rows, [
    { id: '2', personId: '1', rank: '1LT', dutyTitle: 'Commander' },
  ]);
});

test('person lookup distinguishes absent, empty, and malformed duty collections', () => {
  assert.equal(adaptPersonDuties({ person }), undefined);
  assert.deepEqual(adaptPersonDuties({ person, astronautDuties: [] })?.rows, []);
  for (const astronautDuties of [null, 'invalid', [null]]) {
    assert.equal(adaptPersonDuties({ person, astronautDuties }), null);
  }
});
