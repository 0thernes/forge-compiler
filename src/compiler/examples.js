export const EXAMPLES = Object.freeze({
  "Hello World": `print("Hello, World!");`,

  Arrays: `// Array fundamentals: literals, indexing, mutation, push/pop
let a = [10, 20, 30];
print("a = ", a);
print("a[0] = ", a[0], "  a[2] = ", a[2]);
print("len(a) = ", len(a));

a[1] = 99;
print("after a[1]=99: ", a);

a[1] += 1;
print("after a[1]+=1: ", a);

let n = push(a, 40);
print("push(a, 40) → length ", n, ": ", a);

let last = pop(a);
print("pop(a) → ", last, ": ", a);

// Reference semantics: b and a are the same array.
let b = a;
push(b, 777);
print("push(b, 777) → a is ", a);

// Strings can be indexed too.
let s = "FORGE";
print("s[0] = ", s[0], "  s[4] = ", s[4]);`,

  "Bubble Sort": `let a = [64, 25, 12, 90, 11, 42, 7, 38];
print("unsorted: ", a);

let n = len(a);
let i = 0;
while (i < n - 1) {
  let j = 0;
  while (j < n - 1 - i) {
    if (a[j] > a[j + 1]) {
      let temp = a[j];
      a[j] = a[j + 1];
      a[j + 1] = temp;
    }
    j += 1;
  }
  i += 1;
}
print("sorted:   ", a);`,

  Sieve: `// Sieve of Eratosthenes — all primes up to 100
let limit = 100;
let sieve = [];
let i = 0;
while (i <= limit) {
  push(sieve, true);
  i += 1;
}
sieve[0] = false;
sieve[1] = false;

let p = 2;
while (p * p <= limit) {
  if (sieve[p]) {
    let multiple = p * p;
    while (multiple <= limit) {
      sieve[multiple] = false;
      multiple += p;
    }
  }
  p += 1;
}

let primes = [];
let candidate = 2;
while (candidate <= limit) {
  if (sieve[candidate]) { push(primes, candidate); }
  candidate += 1;
}
print(len(primes), " primes up to ", limit, ":");
print(primes);`,

  "Binary Search": `fn binary_search(array, target) {
  let low = 0;
  let high = len(array) - 1;
  while (low <= high) {
    let middle = floor((low + high) / 2);
    if (array[middle] == target) { return middle; }
    if (array[middle] < target) { low = middle + 1; }
    else { high = middle - 1; }
  }
  return -1;
}

let sorted = [2, 5, 8, 12, 16, 23, 38, 56, 72, 91];
print("array: ", sorted);
print("find 23 → index ", binary_search(sorted, 23));
print("find 2  → index ", binary_search(sorted, 2));
print("find 91 → index ", binary_search(sorted, 91));
print("find 40 → index ", binary_search(sorted, 40));`,

  Fibonacci: `let a = 0;
let b = 1;
let i = 0;
while (i < 15) {
  print("fib(", i, ") = ", a);
  let next = b;
  b = a + b;
  a = next;
  i += 1;
}`,

  FizzBuzz: `let i = 1;
while (i <= 30) {
  if (i % 15 == 0) { print("FizzBuzz"); }
  else if (i % 3 == 0) { print("Fizz"); }
  else if (i % 5 == 0) { print("Buzz"); }
  else { print(i); }
  i += 1;
}`,

  Primes: `fn is_prime(n) {
  if (n < 2) { return false; }
  let divisor = 2;
  while (divisor * divisor <= n) {
    if (n % divisor == 0) { return false; }
    divisor += 1;
  }
  return true;
}

let candidate = 2;
let count = 0;
while (candidate <= 50) {
  if (is_prime(candidate)) {
    print(candidate);
    count += 1;
  }
  candidate += 1;
}
print(count, " primes found");`,

  "String Reverse": `fn reverse(value) {
  let result = "";
  let index = len(value) - 1;
  while (index >= 0) {
    result = result + value[index];
    index -= 1;
  }
  return result;
}

print(reverse("Hello, World!"));
print(reverse("FORGE"));
print(reverse("racecar"));`,

  Palindrome: `fn is_palindrome(value) {
  let low = 0;
  let high = len(value) - 1;
  while (low < high) {
    if (value[low] != value[high]) { return false; }
    low += 1;
    high -= 1;
  }
  return true;
}

print("racecar: ", is_palindrome("racecar"));
print("madam: ", is_palindrome("madam"));
print("hello: ", is_palindrome("hello"));
print("civic: ", is_palindrome("civic"));
print("forge: ", is_palindrome("forge"));
print("a: ", is_palindrome("a"));`,

  "GCD + LCM": `fn gcd(a, b) {
  while (b != 0) {
    let next = b;
    b = a % b;
    a = next;
  }
  return a;
}

fn lcm(a, b) {
  return floor(a * b / gcd(a, b));
}

print("gcd(48, 18) = ", gcd(48, 18));
print("gcd(100, 75) = ", gcd(100, 75));
print("lcm(12, 8) = ", lcm(12, 8));
print("lcm(7, 5) = ", lcm(7, 5));`,

  "Tower of Hanoi": `fn hanoi(n, from, to, auxiliary) {
  if (n == 1) {
    print("Move disk 1: ", from, " → ", to);
    return 0;
  }
  hanoi(n - 1, from, auxiliary, to);
  print("Move disk ", n, ": ", from, " → ", to);
  hanoi(n - 1, auxiliary, to, from);
  return 0;
}

hanoi(4, "A", "C", "B");`,

  Collatz: `fn collatz(n) {
  let steps = 0;
  while (n != 1) {
    if (n % 2 == 0) { n = floor(n / 2); }
    else { n = n * 3 + 1; }
    steps += 1;
  }
  return steps;
}

let n = 1;
while (n <= 20) {
  print("collatz(", n, ") = ", collatz(n), " steps");
  n += 1;
}`,

  "Type Safety": `print("type_of(42) = ", type_of(42));
print("type_of(\\"hi\\") = ", type_of("hi"));
print("type_of(true) = ", type_of(true));
print("type_of([1, 2]) = ", type_of([1, 2]));
print();

let score = "score: " + 42;
print(score);
print("1 == 1: ", 1 == 1);
print("1 == \\"1\\": ", 1 == "1");
print("true == 1: ", true == 1);
print();

// Arrays compare by reference.
let a = [1, 2];
let b = [1, 2];
let c = a;
print("[1,2] == [1,2]: ", a == b);
print("a == c (same reference): ", a == c);`,

  Escapes: `print("line1\\nline2");
print("tab:\\there");
print("quote: \\"hi\\"");`,

  "Nested Functions": `fn make_counter() {
  fn count_up(n) {
    return n + 1;
  }
  fn count_down(n) {
    return n - 1;
  }
  fn bounce(n, times) {
    if (times == 0) { return n; }
    if (times % 2 == 0) { return bounce(count_up(n), times - 1); }
    return bounce(count_down(n), times - 1);
  }
  return bounce(0, 10);
}

print("bounce(0, 10) = ", make_counter());`,

  "Lexical Scope": `let value = 10;

fn read_global() {
  return value;
}

fn caller() {
  let value = 99;
  return read_global();
}

fn captured_counter(start) {
  let current = start;
  fn increment() {
    current += 1;
    return current;
  }
  increment();
  return increment();
}

print("global from caller = ", caller());
print("captured counter = ", captured_counter(40));`,
});
