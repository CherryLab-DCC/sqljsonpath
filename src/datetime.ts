import type { Jsonable } from "./ast.js";
import moo from "moo";
import escapeRegExp from "./escapeRegExp.js";

export const Kind = {
  date: "date",
  "time with time zone": "time with time zone",
  "time without time zone": "time without time zone",
  "timestamp with time zone": "timestamp with time zone",
  "timestamp without time zone": "timestamp without time zone",
} as const;

export type DateTime = DateOnly | TimeTZ | Time | TimestampTZ | Timestamp;

// The datetime() method sequentially tries to match its input string to the ISO formats for date, timetz, time, timestamptz, and timestamp.
// does not seem to support fractional seconds.

//const datetime_re = /^([\+-]?\d{4}(?!\d{2}\b))((-?)((0[1-9]|1[0-2])(\3([12]\d|0[1-9]|3[01]))?|W([0-4]\d|5[0-2])(-?[1-7])?|(00[1-9]|0[1-9]\d|[12]\d{2}|3([0-5]\d|6[1-6])))([T\s]((([01]\d|2[0-3])((:?)[0-5]\d)?|24\:?00)([\.,]\d+(?!:))?)?(\17[0-5]\d([\.,]\d+)?)?([zZ]|([\+-])([01]\d|2[0-3]):?([0-5]\d)?)?)?)?$/

const date = /(?:([+\-]?\d{1,4})-(\d{1,2})-(\d{1,2}))/.source;
const time = /(?:(\d{1,2}):(\d{1,2}):(\d{1,2}))/.source;
const tz = /(?:((?:\s+|[+\-])\d{1,2})(?::(\d{1,2}))?)/.source;

const datetimetz_re = new RegExp(
  `^\\s*${date}(?:(?:\\s+|T)${time}${tz}?)?\\s*$`
);
const timetz_re = new RegExp(`^\\s*${time}${tz}?\\s*$`);

[
  "yyyy-mm-dd",
  "HH24:MI:SSTZH:TZM",
  "HH24:MI:SSTZH",
  "HH24:MI:SS",
  "yyyy-mm-dd HH24:MI:SSTZH:TZM",
  "yyyy-mm-dd HH24:MI:SSTZH",
  "yyyy-mm-dd HH24:MI:SS",
  'yyyy-mm-dd"T"HH24:MI:SSTZH:TZM',
  'yyyy-mm-dd"T"HH24:MI:SSTZH',
  'yyyy-mm-dd"T"HH24:MI:SS',
];

interface DateTimeBase extends Jsonable {
  kind: keyof typeof Kind;
  offset?: number;
  type(): string;
  toJSON(): string;
}

export class DateOnly implements DateTimeBase {
  kind = Kind["date"];
  year: number;
  month: number;
  day: number;
  hour?: never;
  minute?: never;
  second?: never;
  offset?: never;
  constructor(year: number, month: number, day: number) {
    this.year = year;
    this.month = month;
    this.day = day;
  }
  type(): string {
    return this.kind;
  }
  toJSON(): string {
    return `\
${String(this.year).padStart(4, "0")}-\
${String(this.month).padStart(2, "0")}-\
${String(this.day).padStart(2, "0")}\
${this.year < 0 ? " BC" : ""}`;
  }
}

export class Timestamp implements DateTimeBase {
  kind = Kind["timestamp without time zone"];
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  offset?: never;
  constructor(
    year: number,
    month: number,
    day: number,
    hour: number,
    minute: number,
    second: number
  ) {
    this.year = year;
    this.month = month;
    this.day = day;
    this.hour = hour;
    this.minute = minute;
    this.second = second;
  }
  type(): string {
    return this.kind;
  }
  toJSON(): string {
    return `\
${String(this.year).padStart(4, "0")}-\
${String(this.month).padStart(2, "0")}-\
${String(this.day).padStart(2, "0")}T\
${String(this.hour).padStart(2, "0")}:\
${String(this.minute).padStart(2, "0")}:\
${
  Number.isInteger(this.second)
    ? this.second.toFixed(0).padStart(2, "0")
    : this.second.toFixed(6).padStart(9, "0")
}\
${this.year < 0 ? " BC" : ""}`;
  }
}

export class TimestampTZ implements DateTimeBase {
  kind = Kind["timestamp with time zone"];
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  offset: number;
  constructor(
    year: number,
    month: number,
    day: number,
    hour: number,
    minute: number,
    second: number,
    offset: number
  ) {
    this.year = year;
    this.month = month;
    this.day = day;
    this.hour = hour;
    this.minute = minute;
    this.second = second;
    this.offset = offset;
  }
  type(): string {
    return this.kind;
  }
  toJSON(): string {
    return `\
${String(this.year).padStart(4, "0")}-\
${String(this.month).padStart(2, "0")}-\
${String(this.day).padStart(2, "0")}T\
${String(this.hour).padStart(2, "0")}:\
${String(this.minute).padStart(2, "0")}:\
${
  Number.isInteger(this.second)
    ? this.second.toFixed(0).padStart(2, "0")
    : this.second.toFixed(6).padStart(9, "0")
}${this.offset < 0 ? "" : "+"}\
${String(Math.floor(this.offset / 60)).padStart(2, "0")}:\
${String(this.offset % 60).padStart(2, "0")}\
${this.year < 0 ? " BC" : ""}`;
  }
}

export class Time implements DateTimeBase {
  kind = Kind["time without time zone"];
  year?: never;
  month?: never;
  day?: never;
  hour: number;
  minute: number;
  second: number;
  offset?: never;
  constructor(hour: number, minute: number, second: number) {
    this.hour = hour;
    this.minute = minute;
    this.second = second;
  }
  type(): string {
    return this.kind;
  }
  toJSON(): string {
    return `\
${String(this.hour).padStart(2, "0")}:\
${String(this.minute).padStart(2, "0")}:\
${
  Number.isInteger(this.second)
    ? this.second.toFixed(0).padStart(2, "0")
    : this.second.toFixed(6).padStart(9, "0")
}`;
  }
}

export class TimeTZ implements DateTimeBase {
  kind = Kind["time with time zone"];
  year?: never;
  month?: never;
  day?: never;
  hour: number;
  minute: number;
  second: number;
  offset: number;
  constructor(hour: number, minute: number, second: number, offset: number) {
    this.hour = hour;
    this.minute = minute;
    this.second = second;
    this.offset = offset;
  }
  type(): string {
    return this.kind;
  }
  toJSON(): string {
    return `\
${String(this.hour).padStart(2, "0")}:\
${String(this.minute).padStart(2, "0")}:\
${
  Number.isInteger(this.second)
    ? this.second.toFixed(0).padStart(2, "0")
    : this.second.toFixed(6).padStart(9, "0")
}${this.offset < 0 ? "" : "+"}\
${String(Math.floor(this.offset / 60)).padStart(2, "0")}:\
${String(this.offset % 60).padStart(2, "0")}`;
  }
}

// The datetime() and datetime(template) methods use the same parsing rules as the to_timestamp SQL function does (see Section 9.8), with three exceptions.
// First, these methods don't allow unmatched template patterns.
// Second, only the following separators are allowed in the template string: minus sign, period, solidus (slash), comma, apostrophe, semicolon, colon and space.
// Third, separators in the template string must exactly match the input string.

// Must leave this untyped so we can use it's keyof type
const main = {
  HH24: { match: ["HH24", "hh24"], value: () => /\d{1,2}/.source }, // hour of day (00–23)
  HH12: [
    { match: ["HH12", "hh12"], value: () => /\d{1,2}/.source }, //hour of day (01–12)
    { match: /[Hh][Hh](?!\d)/, value: () => /\d{1,2}/.source },
  ],
  MI: { match: ["MI", "mi"], value: () => /\d{1,2}/.source }, //	minute (00–59)
  SS: { match: ["SS", "ss"], value: () => /\d{1,2}/.source }, // second (00–59)
  FF1: { match: ["FF1", "ff1"], value: () => /\d{1}/.source }, // tenth of second (0–9)
  FF2: { match: ["FF2", "ff2"], value: () => /\d{2}/.source }, // hundredth of second (00–99)
  FF3: { match: ["MS", "ms", "FF3", "ff3"], value: () => /\d{3}/.source }, // millisecond (000–999)
  FF4: { match: ["FF4", "ff4"], value: () => /\d{4}/.source }, // tenth of a millisecond (0000–9999)
  FF5: { match: ["FF5", "ff5"], value: () => /\d{5}/.source }, // hundredth of a millisecond (00000–99999)
  FF6: { match: ["US", "us", "FF6", "ff6"], value: () => /\d{6}/.source }, // microsecond (000000–999999)
  SSSSS: {
    match: ["SSSSS", "SSSS", "sssss", "ssss"],
    value: () => /\d{5}/.source,
  }, // seconds past midnight (0–86399)
  meridiem: [
    { match: ["AM", "am", "PM", "pm"], value: () => /AM|am|PM|pm/.source }, // meridiem indicator (without periods)
    {
      match: ["A.M.", "a.m.", "P.M.", "p.m."],
      value: () => /A\.M\.|a\.m\.|P\.M\.|p\.m\./.source,
    }, // meridiem indicator (with periods)
  ],
  YYYY: [
    { match: ["Y,YYY", "y,yyy"], value: () => /[+\-]?\d{1}\.\d{3}/.source }, // year (4 or more digits) with comma
    { match: ["YYYY", "yyyy"], value: () => /[+\-]?\d{4}/.source }, // year (4 or more digits)
  ],
  YYY: { match: ["YYY", "yyy"], value: () => /[+\-]?\d{3,4}/.source }, // last 3 digits of year
  YY: { match: ["YY", "yy"], value: () => /[+\-]?\d{2,4}/.source }, // last 2 digits of year
  Y: { match: ["Y", "y"], value: () => /[+\-]?\d{1,4}/.source }, // last digit of year
  IYYY: { match: ["IYYY", "iyyy"], value: () => /\d{4,}/.source }, // ISO 8601 week-numbering year (4 or more digits)
  IYY: { match: ["IYY", "iyy"], value: () => /\d{3}/.source }, // last 3 digits of ISO 8601 week-numbering year
  IY: { match: ["IY", "iy"], value: () => /\d{2}/.source }, // last 2 digits of ISO 8601 week-numbering year
  I: { match: ["I", "i"], value: () => /\d{1}/.source }, // last digit of ISO 8601 week-numbering year
  era: [
    { match: ["BC", "bc", "AD", "ad"], value: () => /BC|bc|AD|ad/.source }, // era indicator (without periods)
    {
      match: ["B.C.", "b.c.", "A.D.", "a.d."],
      value: () => /B\.C\.|b\.c\.|A\.D\.|a\.d\./.source,
    }, // era indicator (with periods)
  ],
  month: [
    { match: "MONTH", value: () => /[]/.source }, // full upper case month name (blank-padded to 9 chars)
    { match: "Month", value: () => /[]/.source }, // full capitalized month name (blank-padded to 9 chars)
    { match: "month", value: () => /[]/.source }, // full lower case month name (blank-padded to 9 chars)
  ],
  mon: [
    { match: "MON", value: () => /[]/.source }, // abbreviated upper case month name (3 chars in English, localized lengths vary)
    { match: "Mon", value: () => /[]/.source }, // abbreviated capitalized month name (3 chars in English, localized lengths vary)
    { match: "mon", value: () => /[]/.source }, // abbreviated lower case month name (3 chars in English, localized lengths vary)
  ],
  MM: { match: ["MM", "mm"], value: () => /\d{1,2}/.source }, // month number (01–12)
  day: [
    { match: "DAY", value: () => /[]/.source }, // full upper case day name (blank-padded to 9 chars)
    { match: "Day", value: () => /[]/.source }, // full capitalized day name (blank-padded to 9 chars)
    { match: "day", value: () => /[]/.source }, // full lower case day name (blank-padded to 9 chars)
  ],
  dy: [
    { match: "DY", value: () => /[]/.source }, // abbreviated upper case day name (3 chars in English, localized lengths vary)
    { match: "Dy", value: () => /[]/.source }, // abbreviated capitalized day name (3 chars in English, localized lengths vary)
    { match: "dy", value: () => /[]/.source }, // abbreviated lower case day name (3 chars in English, localized lengths vary)
  ],
  DDD: { match: ["DDD", "ddd"], value: () => /\d{1,3}/.source }, // day of year (001–366)
  IDDD: { match: ["IDDD", "iddd"], value: () => /\d{1,3}/.source }, // day of ISO 8601 week-numbering year (001–371; day 1 of the year is Monday of the first ISO week)
  DD: { match: ["DD", "dd"], value: () => /\d{1,2}/.source }, // day of month (01–31)
  D: { match: ["D", "d"], value: () => /[1-7]/.source }, // day of the week, Sunday (1) to Saturday (7)
  ID: { match: ["ID", "id"], value: () => /[1-7]/.source }, // ISO 8601 day of the week, Monday (1) to Sunday (7)
  W: { match: ["W", "w"], value: () => /[1-5]/.source }, // week of month (1–5) (the first week starts on the first day of the month)
  WW: { match: ["WW", "ww"], value: () => /\d{2}/.source }, // week number of year (1–53) (the first week starts on the first day of the year)
  IW: { match: ["IW", "iw"], value: () => /\d{2}/.source }, // week number of ISO 8601 week-numbering year (01–53; the first Thursday of the year is in week 1)
  CC: { match: ["CC", "cc"], value: () => /\d{2}/.source }, // century (2 digits) (the twenty-first century starts on 2001-01-01)
  J: { match: ["J", "j"], value: () => /\d+/.source }, // Julian Date (integer days since November 24, 4714 BC at local midnight; see Section B.7)
  Q: { match: ["Q", "q"], value: () => /[1-4]/.source }, // quarter
  rm: [
    { match: "RM", value: () => /[XV]I{0,2}|I{1,2}[XV]|I{1,3}/.source }, // month in upper case Roman numerals (I–XII; I=January)
    { match: "rm", value: () => /[xv]i{0,2}|i{1,2}[xv]|i{1,3}/.source }, // month in lower case Roman numerals (i–xii; i=January)
  ],
  TZH: { match: "TZH", value: () => /[+\- ]?\d{1,2}/.source }, // time-zone hours
  TZM: { match: "TZM", value: () => /\d{1,2}/.source }, // time-zone minutes
  TH: {
    match: ["TH", "th"],
    value: () => /[Ss][Tt]|[Nn][Dd]|[Rr][Dd]|[Tt][Hh]/.source,
  }, // ordinal number suffix
  skip: [
    { match: "FX", value: () => "" }, // fixed format global option
    { match: '"', push: "string", value: () => "" },
    { match: " ", value: () => /\s+/.source },
    {
      match: ["-", ".", "/", ",", "'", ";", ":"],
      value: (s: string) => escapeRegExp(s),
    },
  ],
  invalid: moo.error,
};

type TokenType = keyof typeof main;

export const lexer = moo.states({
  main,
  string: {
    skip: [
      { match: '"', pop: 1, value: () => "" },
      {
        match: /\\./,
        lineBreaks: true,
        value: (s) => escapeRegExp(s.slice(1)),
      },
      { match: /[^\\"]+/, lineBreaks: true, value: (s) => escapeRegExp(s) },
    ],
  },
});

type CaptureKey =
  | "year"
  | "month"
  | "day"
  | "hour"
  | "minute"
  | "second"
  | "tzh"
  | "tzm"
  | "era";
export type CaptureJsonPath = { [K in CaptureKey]?: number | undefined };
export type CaptureFunc = (capture: string) => CaptureJsonPath | null;

const partialYear: CaptureFunc = (capture) => {
  const n = Number(capture);
  return { year: n < 0 || n >= 1000 ? n : 2000 + n };
};

const captureInvalid: CaptureFunc = () => null;
const captureIgnore: CaptureFunc = () => ({});

const templateParsers: { [K in TokenType]: CaptureFunc } = {
  HH24: (s) => ({ hour: Number(s) }), // hour of day (00–23)
  HH12: (s) => {
    const n = Number(s);
    if (n < 1 || n > 12) {
      return null;
    }
    return { hour: n % 12 };
  }, //hour of day (01–12)
  MI: (s) => ({ minute: Number(s) }), //	minute (00–59)
  SS: (s) => ({ second: Number(s) }), // second (00–59)
  FF1: (s) => ({ second: Number(s) / 10 }), // tenth of second (0–9)
  FF2: (s) => ({ second: Number(s) / 100 }), // hundredth of second (00–99)
  FF3: (s) => ({ second: Number(s) / 1000 }), // millisecond (000–999)
  FF4: (s) => ({ second: Number(s) / 10000 }), // tenth of a millisecond (0000–9999)
  FF5: (s) => ({ second: Number(s) / 100000 }), // hundredth of a millisecond (00000–99999)
  FF6: (s) => ({ second: Number(s) / 1000000 }), // microsecond (000000–999999)
  SSSSS: (s) => {
    const n = Number(s);
    if (n > 86399) {
      return null;
    }
    const second = n % 60;
    const minute = Math.floor(n / 60) % 60;
    const hour = Math.floor(n / 3600);
    return { hour, minute, second };
  }, // seconds past midnight (0–86399)
  meridiem: (s) => ({
    hour: s.replace(".", "").toLowerCase() === "am" ? 0 : 12,
  }),
  YYYY: (s) => ({ year: Number(s.replace(",", "")) }),
  YYY: partialYear, // last 3 digits of year
  YY: partialYear, // last 2 digits of year
  Y: partialYear, // last digit of year
  IYYY: captureInvalid, // ISO 8601 week-numbering year (4 or more digits)
  IYY: captureInvalid, // last 3 digits of ISO 8601 week-numbering year
  IY: captureInvalid, // last 2 digits of ISO 8601 week-numbering year
  I: captureInvalid, // last digit of ISO 8601 week-numbering year
  era: (s) => ({ era: s.replace(".", "").toLowerCase() === "bc" ? -1 : 1 }),
  month: captureInvalid, // full month name (blank-padded to 9 chars)
  mon: captureInvalid, // abbreviated month name (3 chars in English, localized lengths vary)
  MM: (s) => ({ month: Number(s) }), // month number (01–12)
  day: captureInvalid, // full day name (blank-padded to 9 chars)
  dy: captureInvalid, // abbreviated day name (3 chars in English, localized lengths vary)
  DDD: captureInvalid, // day of year (001–366)
  IDDD: captureInvalid, // day of ISO 8601 week-numbering year (001–371; day 1 of the year is Monday of the first ISO week)
  DD: (s) => ({ day: Number(s) }), // day of month (01–31)
  D: captureInvalid, // day of the week, Sunday (1) to Saturday (7)
  ID: captureInvalid, // ISO 8601 day of the week, Monday (1) to Sunday (7)
  W: captureInvalid, // week of month (1–5) (the first week starts on the first day of the month)
  WW: captureInvalid, // week number of year (1–53) (the first week starts on the first day of the year)
  IW: captureInvalid, // week number of ISO 8601 week-numbering year (01–53; the first Thursday of the year is in week 1)
  CC: (s) => ({ year: Number(s) * 100 + 1 }), // century (2 digits) (the twenty-first century starts on 2001-01-01)
  J: captureInvalid, // Julian Date (integer days since November 24, 4714 BC at local midnight; see Section B.7)
  Q: captureIgnore, // quarter
  rm: (s) => ({
    month: {
      I: 1,
      II: 2,
      III: 3,
      IV: 4,
      V: 5,
      VI: 6,
      VII: 7,
      VIII: 8,
      IX: 9,
      X: 10,
      XI: 11,
      XII: 12,
    }[s.toUpperCase()],
  }), // month in Roman numerals (I–XII; I=January)
  TZH: (s) => ({ tzh: Number(s) }), // time-zone hours
  TZM: (s) => ({ tzm: Number(s) }), // time-zone minutes
  TH: () => ({}),
  skip: captureIgnore,
  invalid: captureInvalid,
};

export class DateTimeTemplate {
  re: RegExp;
  captureFuncs: CaptureFunc[];
  constructor(re: RegExp, captureFuncs: CaptureFunc[]) {
    this.re = re;
    this.captureFuncs = captureFuncs;
  }
  exec(string: string): CaptureJsonPath | null {
    const match = this.re.exec(string);
    if (!match) {
      return null;
    }
    let acc: CaptureJsonPath = {};
    for (let i = 1; i < match.length; i++) {
      const f = this.captureFuncs[i - 1];
      const s = match[i];
      if (f === undefined || s === undefined) {
        return null;
      }
      const result = f(s);
      if (result === null) {
        return null;
      }
      for (const [key, value] of Object.entries(result)) {
        if (value === undefined) {
          continue;
        }
        const existing = acc[key as CaptureKey];
        acc[key as CaptureKey] =
          existing === undefined ? value : existing + value;
      }
    }
    return acc;
  }

  static compile(template: string): DateTimeTemplate | null {
    let source = "^\\s*";
    const captureFuncs = [];
    for (const token of lexer.reset(template)) {
      if (token.type === "invalid") {
        return null;
      }
      if (token.type === "skip") {
        source += token.value;
        continue;
      }
      source += `(${token.value})`;
      captureFuncs.push(templateParsers[token.type as TokenType]);
    }
    source += "\\s*$";
    const re = new RegExp(source);
    return new DateTimeTemplate(re, captureFuncs);
  }
}

export function datetimeFromCaptureJsonPath(
  captured?: CaptureJsonPath | null
): DateTime | undefined {
  if (!captured) {
    return undefined;
  }
  let { year, month, day, hour, minute, second, tzh, tzm, era } = captured;
  if (
    year !== undefined ||
    month !== undefined ||
    day !== undefined ||
    era !== undefined
  ) {
    era = era ?? 1;
    year = (year ?? 0) * era;
    month = month ?? 1;
    day = day ?? 1;
    if (year === 0) {
      year = -1;
    }
    if (
      year < -4714 ||
      (year === -4714 && (month < 11 || (month === 11 && day < 24)))
    ) {
      return undefined;
    }
    if (day === 0) {
      return undefined;
    }
    switch (month) {
      case 0:
        return undefined;
      case 1:
      case 3:
      case 5:
      case 7:
      case 8:
      case 10:
      case 12:
        if (day > 31) {
          return undefined;
        }
        break;
      case 2: {
        if (day > 29) {
          return undefined;
        }
        if (day === 29) {
          const y = year < 0 ? year + 1 : year;
          if (y % 100 ? y % 400 : y % 4) {
            return undefined;
          }
        }
        break;
      }
      default:
        if (month > 12 || day > 30) {
          return undefined;
        }
    }
    if (hour === undefined && minute === undefined && second === undefined) {
      return new DateOnly(year, month, day);
    }
  }
  if (hour === undefined && minute === undefined && second === undefined) {
    return undefined;
  }
  hour = hour ?? 0;
  minute = minute ?? 0;
  second = second ?? 0;
  if (hour >= 24 || minute >= 60 || second >= 60) {
    return undefined;
  }
  if (tzh === undefined && tzm === undefined) {
    if (year !== undefined && month !== undefined && day !== undefined) {
      return new Timestamp(year, month, day, hour, minute, second);
    } else {
      return new Time(hour, minute, second);
    }
  }
  tzh = tzh ?? 0;
  tzm = tzm ?? 0;
  if (tzm >= 60 || Math.abs(tzh) > 15) {
    return undefined;
  }
  const offset = tzh * 60 + (tzh < 0 ? -tzm : tzm);
  if (year !== undefined && month !== undefined && day !== undefined) {
    return new TimestampTZ(year, month, day, hour, minute, second, offset);
  } else {
    return new TimeTZ(hour, minute, second, offset);
  }
}

export function captureFromDefault(value: string): CaptureJsonPath | null {
  let match = datetimetz_re.exec(value);
  let match_timetz = null;
  const captured: CaptureJsonPath = {};
  if (match !== null) {
    captured.year = Number(match[1]);
    captured.month = Number(match[2]);
    captured.day = Number(match[3]);
    if (match[4] !== undefined) {
      match_timetz = match.slice(4);
    }
  } else {
    match = timetz_re.exec(value);
    if (match !== null) {
      match_timetz = match.slice(1);
    }
  }
  if (match_timetz) {
    captured.hour = Number(match_timetz[0]);
    captured.minute = Number(match_timetz[1]);
    captured.second = Number(match_timetz[2]);
    if (match_timetz[3] !== undefined) {
      captured.tzh = Number(match_timetz[3]);
      captured.tzm = Number(match_timetz[4] ?? 0);
    }
  }
  return captured;
}

export default function datetime(
  value: string,
  template: string | null = null
): DateTime | undefined {
  let result;
  if (template === null) {
    result = captureFromDefault(value);
  } else {
    const compiled = DateTimeTemplate.compile(template);
    if (!compiled) {
      return undefined;
    }
    result = compiled.exec(value);
  }
  return datetimeFromCaptureJsonPath(result);
}
