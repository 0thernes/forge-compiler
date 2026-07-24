// ── EXAMPLE PROGRAMS ──
export const EXAMPLES = {
  "Hello World": `print("Hello, World!");`,
  "Arrays": `// Array fundamentals: literals, indexing, mutation, push/pop
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

// Reference semantics: b and a are the SAME array
let b = a;
push(b, 777);
print("push(b, 777) → a is ", a);

// Strings index too
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
  "Sieve": `// Sieve of Eratosthenes — all primes up to 100
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
    let m = p * p;
    while (m <= limit) {
      sieve[m] = false;
      m += p;
    }
  }
  p += 1;
}

let primes = [];
let n = 2;
while (n <= limit) {
  if (sieve[n]) { push(primes, n); }
  n += 1;
}
print(len(primes), " primes up to ", limit, ":");
print(primes);`,
  "Binary Search": `fn binary_search(arr, target) {
  let lo = 0;
  let hi = len(arr) - 1;
  while (lo <= hi) {
    let mid = floor((lo + hi) / 2);
    if (arr[mid] == target) { return mid; }
    if (arr[mid] < target) { lo = mid + 1; }
    else { hi = mid - 1; }
  }
  return -1;
}

let sorted = [2, 5, 8, 12, 16, 23, 38, 56, 72, 91];
print("array: ", sorted);
print("find 23 → index ", binary_search(sorted, 23));
print("find 2  → index ", binary_search(sorted, 2));
print("find 91 → index ", binary_search(sorted, 91));
print("find 40 → index ", binary_search(sorted, 40));`,
  "Fibonacci": `let a = 0;
let b = 1;
let i = 0;
while (i < 15) {
  print("fib(", i, ") = ", a);
  let temp = b;
  b = a + b;
  a = temp;
  i += 1;
}`,
  "FizzBuzz": `let i = 1;
while (i <= 30) {
  if (i % 15 == 0) { print("FizzBuzz"); }
  else if (i % 3 == 0) { print("Fizz"); }
  else if (i % 5 == 0) { print("Buzz"); }
  else { print(i); }
  i += 1;
}`,
  "Primes": `fn is_prime(n) {
  if (n < 2) { return false; }
  let d = 2;
  while (d * d <= n) {
    if (n % d == 0) { return false; }
    d += 1;
  }
  return true;
}

let n = 2;
let count = 0;
while (n <= 50) {
  if (is_prime(n)) {
    print(n);
    count += 1;
  }
  n += 1;
}
print(count, " primes found");`,
  "String Reverse": `fn reverse(s) {
  let result = "";
  let i = len(s) - 1;
  while (i >= 0) {
    result = result + s[i];
    i -= 1;
  }
  return result;
}

print(reverse("Hello, World!"));
print(reverse("FORGE"));
print(reverse("racecar"));`,
  "Palindrome": `fn is_palindrome(s) {
  let lo = 0;
  let hi = len(s) - 1;
  while (lo < hi) {
    if (s[lo] != s[hi]) {
      return false;
    }
    lo += 1;
    hi -= 1;
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
    let temp = b;
    b = a % b;
    a = temp;
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
  "Tower of Hanoi": `fn hanoi(n, from, to, aux) {
  if (n == 1) {
    print("Move disk 1: ", from, " → ", to);
    return 0;
  }
  hanoi(n - 1, from, aux, to);
  print("Move disk ", n, ": ", from, " → ", to);
  hanoi(n - 1, aux, to, from);
  return 0;
}

hanoi(4, "A", "C", "B");`,
  "Collatz": `fn collatz(n) {
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
print("type_of([1,2]) = ", type_of([1, 2]));
print();
let x = "score: " + 42;
print(x);
print("1 == 1: ", 1 == 1);
print("1 == \\"1\\": ", 1 == "1");
print("true == 1: ", true == 1);
print();
// Arrays compare by REFERENCE
let a = [1, 2];
let b = [1, 2];
let c = a;
print("[1,2] == [1,2]: ", a == b);
print("a == c (same ref): ", a == c);`,
  "Escapes": `print("line1\\nline2");
print("tab:\\there");
print("quote: \\"hi\\"");`,
  "Closures": `fn make_counter() {
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
};
