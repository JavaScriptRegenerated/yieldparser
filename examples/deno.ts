import { parse, mustEnd } from 'https://unpkg.com/parcook@0.1.4?module';

function* Digit() {
  const [digit]: [string] = yield /^\d+/;
  const value = parseInt(digit, 10);
  if (value < 0 || value > 255) {
    return new Error(`Digit must be between 0 and 255, was ${value}`);
  }
  return value;
}

function* IPAddress() {
  const first = yield Digit;
  yield '.';
  const second = yield Digit;
  yield '.';
  const third = yield Digit;
  yield '.';
  const fourth = yield Digit;
  yield mustEnd;
  return [first, second, third, fourth];
}

console.log(parse('1.2.3.4', IPAddress()));
console.log(parse('1.2.3.256', IPAddress()));
