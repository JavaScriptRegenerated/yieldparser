import { has, optional, parse, ParseGenerator, ParseResult, ParseYieldable } from './index';

describe('natural date parser', () => {
  const whitespaceOptional = /^\s*/;

  function* ParseInt() {
    const [stringValue]: [string] = yield /^\d+/;
    return parseInt(stringValue, 10);
  }
  
  const weekdayChoices = Object.freeze(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const);
  type Weekday = (typeof weekdayChoices)[0 | 1 | 2 | 3 | 4 | 5 | 6];
  
  function* WeekdayParser() {
    let repeats: boolean = yield has(/^every\b/);
    yield optional(/^next\b/);
    
    yield whitespaceOptional;
    
    const weekday: Weekday = yield weekdayChoices;
    repeats = repeats || (yield has(/^[s]\b/));
    
    return { weekday, repeats };
  }
  
  function* AnotherWeekdayParser() {
    yield whitespaceOptional;
    yield optional('and', 'or');
    yield whitespaceOptional;
    return yield WeekdayParser;
  }
  
  function* WeekdaysParser() {
    let repeats = false;
    
    const weekdays = new Set<Weekday>();
    
    let result: { weekday: Weekday, repeats: boolean };
    result = yield WeekdayParser;
    
    weekdays.add(result.weekday);
    repeats = repeats || result.repeats;
    
    while (result = yield optional(AnotherWeekdayParser)) {
      weekdays.add(result.weekday);
      repeats = repeats || result.repeats;
    }
    
    return { weekdays, repeats };
  }
  
  function* MinutesSuffixParser() {
    yield ':';
    const minutes = yield ParseInt;
    return minutes;
  }
  
  function* TimeOfDayParser() {
    let hours = yield ParseInt;
    const minutes = yield optional(MinutesSuffixParser);
    const amOrPm = yield optional('am', 'pm');
    if (amOrPm === 'pm') {
      hours += 12;
    }
    return { hours, minutes };
  }
  
  function* TimespanSuffixParser() {
    const started = yield optional('to', '-', '–', '—', 'until');
    if (started === undefined) return undefined;
    yield whitespaceOptional;
    return yield TimeOfDayParser;
  }
  
  function* TimespanParser() {
    yield ['from', 'at', ''];
    yield whitespaceOptional;
    const startTime = yield TimeOfDayParser;
    yield whitespaceOptional;
    const endTime = yield optional(TimespanSuffixParser);
    return { startTime, endTime };
  }
  
  interface Result {
    weekdays: Set<Weekday>;
    repeats: undefined | 'weekly';
    startTime: { hours: number, minutes?: number };
    endTime: { hours: number, minutes?: number };
  }

  function* NaturalDateParser(): ParseGenerator<Result> {
    yield whitespaceOptional;
    const { weekdays, repeats } = yield WeekdaysParser;
    yield whitespaceOptional;
    
    yield whitespaceOptional;
    const timespan = yield optional(TimespanParser);    
    yield whitespaceOptional;

    return { repeats: repeats ? 'weekly' : undefined, weekdays, ...(timespan as any) };
  }
  
  function parseNaturalDate(input: string) {
    input = input.toLowerCase();
    input = input.replace(/[,]/g, '');
    return parse(input, NaturalDateParser());
  }

  test.each([
    ['Monday', { weekdays: new Set(['monday']) }],
    ['Wednesday', { weekdays: new Set(['wednesday']) }],
    [' Wednesday ', { weekdays: new Set(['wednesday']) }],
    ['Wednesday and Saturday', { weekdays: new Set(['wednesday', 'saturday']) }],
    ['Wednesday or Saturday', { weekdays: new Set(['wednesday', 'saturday']) }],
    ['Wednesday, Saturday', { weekdays: new Set(['wednesday', 'saturday']) }],
    ['Wednesday and, Saturday', { weekdays: new Set(['wednesday', 'saturday']) }],
    ['Every Wednesday', { repeats: 'weekly', weekdays: new Set(['wednesday']) }],
    [' Every Wednesday ', { repeats: 'weekly', weekdays: new Set(['wednesday']) }],
    ['Every Wednesday or Saturday', { repeats: 'weekly', weekdays: new Set(['wednesday', 'saturday']) }],
    ['Wednesdays', { repeats: 'weekly', weekdays: new Set(['wednesday']) }],
    [' Wednesdays ', { repeats: 'weekly', weekdays: new Set(['wednesday']) }],
    ['Wednesdays and Tuesdays', { repeats: 'weekly', weekdays: new Set(['wednesday', 'tuesday']) }],
    [' Wednesdays and Tuesdays ', { repeats: 'weekly', weekdays: new Set(['wednesday', 'tuesday']) }],
    ['Wednesdays and Tuesdays and Fridays and Wednesdays', { repeats: 'weekly', weekdays: new Set(['wednesday', 'tuesday', 'friday']) }],
    ['Wednesdays at 9', { repeats: 'weekly', weekdays: new Set(['wednesday']), startTime: { hours: 9 } }],
    [' Wednesdays at 9 ', { repeats: 'weekly', weekdays: new Set(['wednesday']), startTime: { hours: 9 } }],
    ['Wednesdays at 9:30', { repeats: 'weekly', weekdays: new Set(['wednesday']), startTime: { hours: 9, minutes: 30 } }],
    ['Wednesdays at 9:59', { repeats: 'weekly', weekdays: new Set(['wednesday']), startTime: { hours: 9, minutes: 59 } }],
    ['Wednesdays at 9:30am', { repeats: 'weekly', weekdays: new Set(['wednesday']), startTime: { hours: 9, minutes: 30 } }],
    ['Wednesdays at 9:30pm', { repeats: 'weekly', weekdays: new Set(['wednesday']), startTime: { hours: 21, minutes: 30 } }],
    ['Mondays at 11:30', { repeats: 'weekly', weekdays: new Set(['monday']), startTime: { hours: 11, minutes: 30 } }],
    ['Mondays at 9:30 to 10:30', { repeats: 'weekly', weekdays: new Set(['monday']), startTime: { hours: 9, minutes: 30 }, endTime: { hours: 10, minutes: 30 } }],
    ['Mondays and Thursdays at 9:30 to 10:30', { repeats: 'weekly', weekdays: new Set(['monday', 'thursday']), startTime: { hours: 9, minutes: 30 }, endTime: { hours: 10, minutes: 30 } }],
    ['Mondays at 9:30pm to 10:30pm', { repeats: 'weekly', weekdays: new Set(['monday']), startTime: { hours: 21, minutes: 30 }, endTime: { hours: 22, minutes: 30 } }],
  ])('%o', (input: string, output) => {
    expect(parseNaturalDate(input)).toEqual({
      success: true,
      result: output,
      remaining: '',
    });
  });
});
