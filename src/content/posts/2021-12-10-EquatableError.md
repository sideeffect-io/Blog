---
title: Equatable Errors in Swift
date: 2021-12-10
description: Error is a base type in Swift that aims to represent an issue happening in the application flow; thus, it is very common to use it as an existential type that will cross the application layers. With Error being a protocol, we can implement our own custom errors making them Equatable if needed. In doing so we might have to leak implementation details across the application. This article explores a way to make an error conform to Equatable without compromising its abstraction.
tags: language
image: images/2021-12-10-EquatableError/header.jpg
---

# Equatable Error in Swift

# Introduction

Error is an easy to use protocol in Swift. As it can be used as an [existential type](https://docs.swift.org/swift-book/LanguageGuide/Protocols.html#ID275), you can declare a value of type `Error` and pass it around:

```swift
func printError(_ error: Error) {
    print(error)
}

struct NetworkError: Error {}
struct DatabaseError: Error {}

let error: Error = NetworkError()
printError(error) // prints "NetworkError()"
```

By using `Error` as an existential type, we avoid leaking implementation details. We can pass the `error` variable as the `Error` protocol to the `printError` function. The function does not need to know the underlying concrete `Error` type. The code becomes more decoupled and versatile since it can be used with any concrete error conforming to the protocol. This is basically what abstraction is all about.

Sometimes we need errors to be `Equatable`; unfortunately, `Equatable` cannot be used as an existential type. The following code won't compile:

```swift
func printError(_ error: Error & Equatable) {
    print(error)
}
```

In the same way, when we want to define an `Equatable` data type that embeds an `Error`, the `Equatable` conformance is broken due to the `Error` type:

```swift
enum State: Equatable {
    case loading
    case loaded
    case failed(Error) // Error does not conform to Equatable
}
```

We can try to enforce the conformance to `Equatable` for the embedded error, but for the aforementioned reason, this code won't compile either:

```swift
enum State: Equatable {
    case loading
    case loaded
    case failed(Error & Equatable)
}
```

One way to make it work is to define our own `Equatable` error type:

```swift
struct NetworkError: Error, Equatable {}
struct DatabaseError: Error, Equatable {}

enum StateError: Error, Equatable {
    case network(NetworkError)
    case database(DatabaseError)
}

enum State: Equatable {
    case loading
    case loaded
    case failed(StateError)
}
```

But this comes with a price: we leak the implementation details. We should not need to know the type of error, or even less, the technology behind it. Using `network` or `database` is an information reserved to the dependency injection layer, not the business layer. We want the error to be just that ... an `Error`.

One other way to overcome this problem would be to use constraint generics:

```swift
enum State<ErrorType: Error & Equatable>: Equatable {
    case loading
    case loaded
    case failed(ErrorType)
}
```

This does not seem to be a good/easy solution:

- we still leak implementation details: `let state = State<StateError>.loading`
- we have to specify the error type even if the state is not `failed`: `let state: State = .loaded` won't compile because the `ErrorType` is missing.

Before trying to find another solution to this problem, I think it is important to understand why the usage of `Equatable` can be tricky.

## The Equatable protocol

According to the Swift Standard Library:

> Types that conform to the `Equatable` protocol can be compared for equality using the equal-to operator (`==`) or inequality using the not-equal-to operator (`!=`).

A lot of Swift types conform to Equatable.

```swift
let a: Int = 2
let b: Int = 3
let c: Int = 2

a == b // false
a == c // true
```

```swift
let a: String = "2"
let b: String = "3"
let c: String = "2"

a == b // false
a == c // true
```

Although `Int` and `String` both conform to `Equatable`, it does not mean they can be compared for equality.

```swift
let a: Int = 2
let b: String = "3"

a == b

// error: binary operator '==' cannot be applied to operands of type 'Int' and 'String'
// overloads for '==' exist with these partially matching parameter lists: (Int, Int), (String, String)
```

The error seems logical: we cannot compare Ints and Strings for equality in the real life either. But what really forbids us from doing this in Swift? Well, the answer lies in the definition of the protocol:

```swift
public protocol Equatable {
    /// Returns a Boolean value indicating whether two values are equal.
    /// - Parameters:
    ///   - lhs: A value to compare.
    ///   - rhs: Another value to compare.
    static func == (lhs: Self, rhs: Self) -> Bool
}
```

The `==` function expects two parameters of the same type, that is to say `Self`, the type conforming to `Equatable`. Obviously, `Int` and `String` are not of the same type. This explains why we can't compare them for equality.

Another carateristic of the `Equatable` protocol is that it cannot be used as an [existential type](https://docs.swift.org/swift-book/LanguageGuide/Protocols.html#ID275).

If you try to use the `Equatable` protocol as an existential type:

```swift
let value: Equatable = "1"
```

You will be presented with this error:

> protocol 'Equatable' can only be used as a generic constraint because it has Self or associated type requirements

In the protocol definition, `Self` is used to strictly identify the type to be compared so the test for equality can be performed. By hiding the concrete type of the variable for the benefit of `Equatable`, the compiler would use that signature for the equality check:

```swift
static func == (lhs: Equatable, rhs: Equatable) -> Bool {}
```

There is not enough information in `Equatable` to perform such a comparison.

This is also what forbids us from using `Equatable` in arrays:

```swift
let array: [Equatable] = [1, 2, 3, 4, 5]
```

The compiler doesn't have enough information about each element. It would be impossible to perform a comparison for equality as a whole.

## EquatableError

Let's get back to our problem:

- We want to use `Error` without leaking implementation details
- We want to embed `Error` in some `Equatable` data type without breaking the `Equatable` conformance

Ok, the base implementation could be:

```swift
struct EquatableError: Error, Equatable {
    let base: Error
}
```

Obviously this won't compile since the `base` is not `Equatable` ... it's a snake biting its own tail!

Let's satisfy the compiler and add an `==` function:

```swift
struct EquatableError: Error, Equatable {
    let base: Error

    static func ==(lhs: EquatableError, rhs: EquatableError) -> Bool {
        return type(of: lhs.base) == type(of: rhs.base) &&
        lhs.base.localizedDescription == rhs.base.localizedDescription
    }
}
```

We make sure both `base` errors are the same type and their only property is equal, but it can be easily fooled:

```swift
struct NetworkError: LocalizedError, Equatable {
    let code: Int
    var errorDescription: String? { "Foo" }
}

let errorA = EquatableError(base: NetworkError(code: 1))
let errorB = EquatableError(base: NetworkError(code: 2))

errorA == errorB // will output `true`
```

We would expect `errorA` and `errorB` to **NOT BE** equal because of their different `code` properties, but unfortunately only the `localizedDescription` is taken into account in the equality check.

We should depend on the `==` function of the `base` error:

```swift
struct EquatableError: Error, Equatable {
    let base: Error
    private let equals: (Error) -> Bool

    init<Base: Error & Equatable>(_ base: Base) {
        self.base = base
        self.equals = { ($0 as? Base) == base }
    }

    static func ==(lhs: EquatableError, rhs: EquatableError) -> Bool {
        lhs.equals(rhs.base)
    }
}
```

Let's give it a spin:

```swift
enum Reason: Equatable {
    case badNetwcork
    case noNetwork
}

struct NetworkError: Error, Equatable {
    let code: Int
    let reason: Reason
    let isRecoverable: Bool

    static func ==(lhs: NetworkError, rhs: NetworkError) -> Bool {
        lhs.code == rhs.code && lhs.reason == rhs.reason
    }
}

let networkErrorA = NetworkError(code: 1701, reason: .badNetwcork, isRecoverable: false)
let networkErrorB = NetworkError(code: 1701, reason: .badNetwcork, isRecoverable: true)
let networkErrorC = NetworkError(code: 1702, reason: .noNetwork, isRecoverable: false)

networkErrorA == networkErrorB // prints true 👍
networkErrorA == networkErrorC // prints false 👍

let equatableErrorA = EquatableError(networkErrorA)
let equatableErrorB = EquatableError(networkErrorB)
let equatableErrorC = EquatableError(networkErrorC)

equatableErrorA == equatableErrorB // prints true 👍
equatableErrorA == equatableErrorC // prints false 👍

```

The only downside of this implementation is the `Equatable` constraint on the `Base` type. What if we want to make any `Error` be an `EquatableError`?

Well, there's an acceptable solution to that:

```swift
struct EquatableError: Error, Equatable {
    let base: Error
    private let equals: (Error) -> Bool

    init<Base: Error>(_ base: Base) {
        self.base = base
        self.equals = { String(reflecting: $0) == String(reflecting: base) }
    }

    init<Base: Error & Equatable>(_ base: Base) {
        self.base = base
        self.equals = { ($0 as? Base) == base }
    }

    static func == (lhs: EquatableError, rhs: EquatableError) -> Bool {
        lhs.equals(rhs.base)
    }
}
```

If the `base` error is not `Equatable` we can use reflection to inspect its internal structure and use it as a comparison point. Swift provides us with a handy `String` initializer for this:

```swift
let networkError = NetworkError(code: 1701, reason: .badNetwcork, isRecoverable: false)
let description = String(reflecting: networkError)

print(description) // will print NetworkError(code: 1701, reason: Reason.badNetwcork, isRecoverable: false)
```

Using `String(reflecting:)` is an acceptable fallback, but not 100% reliable since we can still make the type conform to `CustomDebugStringConvertible` or `CustomStringConvertible` or `TextOutputStreamable` and influence the resulting String.

In the end our model can embed the `EquatableError` while being `Equatable` and without leaking implementation details.

```swift
enum State: Equatable {
    case loading
    case loaded
    case failed(EquatableError)
}
```

Then we can still get the underlying concrete `Error`:

```swift
if case let State.failed(error) = state,
        let networkError = error.base as? NetworkError {
    ....
}
```

## Bonus

We can add some nice utilities to our code.

First, let's make `EquatableError` conform to `CustomStringConvertible` and delegate the description to its base error.

```swift
struct EquatableError: Error, Equatable, CustomStringConvertible {
    ...
    var description: String {
        "\(self.base)"
    }
}
```

In doing so, we can print the `EquatableError` as if it was its base.

```swift
let networkError = NetworkError(code: 1701, reason: .badNetwcork, isRecoverable: false)
let equatableError = EquatableError(networkError)

print(equatableError) // prints NetworkError(code: 1701, reason: Reason.badNetwcork, isRecoverable: false)
```

In the same way, we can also delegate the `localizedDescription` to the base error:

```swift
struct EquatableError: Error, Equatable, CustomStringConvertible {
    ...
    var localizedDescription: String {
        self.base.localizedDescription
    }
}
```

Let's also ease the making of an `EquatableError` from any error:

```swift
extension Error where Self: Equatable {
    func toEquatableError() -> EquatableError {
        EquatableError(self)
    }
}

extension Error {
    func toEquatableError() -> EquatableError {
        EquatableError(self)
    }
}

let equatableError = NetworkError(
    code: 1701,
    reason: .badNetwcork,
    isRecoverable: false
).toEquatableError()
```

And finally, we can provide a helper function to unwrap the base error as a concrete `Error`:

```swift
struct EquatableError: Error, Equatable, CustomStringConvertible {
    ...
    func asError<Base: Error>(type: Base.Type) -> Base? {
        self.base as? Base
    }
}

if let networkError = equatableError.asError(type: NetworkError.self) {
    ...
}
```

Here is the complete implementation for `EquatableError`:

```swift
struct EquatableError: Error, Equatable, CustomStringConvertible {
    let base: Error
    private let equals: (Error) -> Bool

    init<Base: Error>(_ base: Base) {
        self.base = base
        self.equals = { String(reflecting: $0) == String(reflecting: base) }
    }

    init<Base: Error & Equatable>(_ base: Base) {
        self.base = base
        self.equals = { ($0 as? Base) == base }
    }

    static func ==(lhs: EquatableError, rhs: EquatableError) -> Bool {
        lhs.equals(rhs.base)
    }

    var description: String {
        "\(self.base)"
    }

    func asError<Base: Error>(type: Base.Type) -> Base? {
        self.base as? Base
    }

    var localizedDescription: String {
        self.base.localizedDescription
    }
}

extension Error where Self: Equatable {
    func toEquatableError() -> EquatableError {
        EquatableError(self)
    }
}

extension Error {
    func toEquatableError() -> EquatableError {
        EquatableError(self)
    }
}
```

I hope this helps. Thanks for reading.

Special thanks to Ryan F. and Ryan G. for their reviews.
