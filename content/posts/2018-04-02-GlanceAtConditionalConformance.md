---
title: A glance at conditional conformance
date: 2018-04-02
description: Swift 4.1 is available since a few days now and it comes with an interesting feature - Conditional conformance. This is a new tool for achieving Protocol Oriented Programming as well as API designing. This post is a quick take on this brand new technic and will be followed for sure by deep dive posts in a few weeks.
tags: language
image: images/2018-04-02-GlanceAtConditionalConformance/swift4.1.png
---

Swift 4.1 is available since a few days now and it comes with an interesting feature: **Conditional conformance**. This is a new tool for achieving Protocol Oriented Programming as well as API designing. This post is a quick take on this brand new technic and will be followed for sure by deep dive posts in a few weeks.

# It's all about extensions

With Swift, one can be a little bit confused with all the different ways of implementing extensions. As the language matures, new extensions possibilities come up and developers have to choose the good one 🤨.

## Basic extensions

Basically an extension allows to augment the behavior of a type without having to subclass it:

```swift
extension String {
    public func numberOf (letter: Character) -> Int {
        return self.filter { $0 == letter }.count
    }

    static func build (withNumberOfSpaces spaces: Int) -> String {
        return [Int](1...spaces).reduce("", { (previous, _) -> String in
            return previous + " "
        })
    }
}

let blog = "twittemb.github.io"
let emptySpaces = String.build(withNumberOfSpaces: 10)

print ("Number of t in \(blog): \(blog.numberOf(letter: "t"))"")
/// will print: Number of t in twittemb.github.io: 4

print ("String from factory: |\(emptySpaces)|")
/// will print: String from factory: |          |
```

It is useful to make utility functions or to implement an efficient factory pattern.

## Conditional extensions

There is a refinement to basic extension dedicated to generic types:

```swift
extension Array where Element: Numeric {
    func sum () -> Element {
        return self.reduce (0, +)
    }
}

let numerics = [1, 2, 3, 4, 5.5]
print ("Sum of elements in \(numerics): \(numerics.sum())")

/// will print: Sum of elements in [1.0, 2.0, 3.0, 4.0, 5.5]: 15.5
```

It would probably not make sense to apply a sum() function to an Array of Bool for instance. This kind of extension allows the developer to bring new features to an existing type but make them safe to use at the same time. It is something very useful when you're designing an API that is to be used by other developers. They can benefit some code for "free" once and only once they meet the good requirements.

## Conformance extensions

Not only can extensions add behaviors to existing types but also can they amend a type itself to make it conform to a Protocol.

```swift
protocol Resettable {
    func reset () -> Self
}

extension String: Resettable {
    func reset() -> String {
        return ""
    }
}

extension Int: Resettable {
    func reset() -> Int {
        return 0
    }
}

extension Optional: Resettable {
    func reset() -> Optional<Wrapped> {
        return nil
    }
}

let name = "Spock"
let age = 120
let isVulcan: Bool? = true

let resettables: [Resettable] = ["Spock", 120 , isVulcan]
print ("Array before reset: \(resettables)")
/// will print: Array before reset: ["Spock", 120, Optional(true)]

let reset = resettables.map { $0.reset() }
print ("Array after reset: \(reset)")
/// will print: Array after reset: ["", 0, nil]
```

This brings uniformity where there was heterogeneity. It would have been impossible to mix **Strings**, **Ints** and **Optionals** into an **Array** without having them conformed to the same Protocol.

But, although every element of the Array is a "**Resettable**", we still have to parse it (with **map**) and call "**reset()**" on each of these to achieve a global operation.

Conditional conformace will help a lot in making this operation seamless for the developer who wants to reset the whole Array.

## Protocol extensions

So far we haven't spoken about Protocol Oriented Programming. This paradigm comes with the ability to add a default behavior to a Protocol. Types that conform to this protocol will benefit this default behavior as well (or override it). It is a special type of extension and it is not really the point of this blog post. So, let's not introduce to much noise here and focus on the ability to extend a concrete type.

# Conform only if …

**Conditional conformance** is the brand new feature that comes with Swift 4.1. It is a mix between **conditional extension** and **conformance extension**. Being so, it inherits both of their key principles:

* bring new features but make them safe to use at the same time
* bring uniformity where there was heterogeneity

In fact one of the main idea behind that is: if a behavior can be applied to each element of a superset, then we can consider that this behavior can also be applied to the superset itself :

```swift
extension Array: Resettable where Element == Resettable {
    func reset() -> Array<Element> {
        return self.map { $0.reset() }
    }
}

let innerResettableArray: [Resettable] = ["Spock", 120]
let resettableArray: [Resettable] = ["Kirk",
                                      45,
                                      Optional<Bool>(true),
                                      innerResettableArray]

print ("Array before reset: \(resettableArray)")
/// will print: Array before reset: ["Kirk", 45, Optional(true), ["Spock", 120]]

print ("Array after reset: \(resettableArray.reset())")
/// will print: Array after reset: ["", 0, nil, ["", 0]]
```

As every element of the Array is **Resettable**, so is the whole Array. It is exactly what Apple has done with Equatable and Hashable for instance. With Swift 4.1, an Array of Elements that are Equatables, is Equatable itself.

What's great and very powerful in our example is that we can embed an Array of Resettables inside the root Array, and with only one statement "**resettableArray.reset()**", the whole data structure is being reset. It is a very elegant way to deal with **recursivity**.

As we can see, in terms of API designing we have a great benefit in using "**Conditional conformance**" over basic "**Conformance extension**". The API designer will internalize in its framework the code (here the **reset()** function) he thinks smart to offer for free to the developers who match the appropriate requirements.

## Leverage conditional conformance to ease Design Patterns implementation

There are certain kinds of design patterns that can benefit from the ability that comes with conditional conformance to make a behavior apply to a "container" type. Again, this is mostly seen from an API designer perspective.

**Visitor** is a pretty simple Design Pattern that allows to externalize the parsing of a data structure. If you want a detailed explanation: [Visitor Pattern](https://en.wikipedia.org/wiki/Visitor_pattern).

Here, we will implement **Persons** and **Cars,**&nbsp;data structures that are "**Visitables**". With conditional conformance, **Containers** of "**Visitables**" will be "**Visitable**" as well:

```swift
protocol Visitor {
    func visit (visitable: Visitable)
}

protocol Visitable {
    func accept (visitor: Visitor)
}

/// a Person can be visited
struct Person {
    let name: String
    let age: Int
}

extension Person: Visitable {
    func accept (visitor: Visitor) {
        if self.age > 30 {
            visitor.visit(visitable: self)
        }
    }
}

/// a Car can be visited
struct Car {
    let isElectric: Bool
    let model: String
    let price: Double
}

extension Car: Visitable {
    func accept (visitor: Visitor) {
        if self.isElectric {
            visitor.visit(visitable: self)
        }
    }
}

/// an Array of Visitables is also Visitable
extension Array: Visitable where Element == Visitable {
    func accept (visitor: Visitor) {
        self.forEach { $0.accept(visitor: visitor) }
    }
}

/// an Dictionary of Visitables is also Visitable
extension Dictionary: Visitable where Value == Visitable {
    func accept (visitor: Visitor) {
        self.values.forEach { $0.accept(visitor: visitor) }
    }
}

class AnyVisitor: Visitor {
    func visit (visitable: Visitable) {
        switch visitable {
        case let person as Person:
            print ("\(person.name) is \(person.age) years old")
        case let car as Car:
            print ("\(car.model)'s price is \(car.price)$")
        default:
            print (visitable)
        }
    }
}

let ironman = Person(name: "Tony Stark", age: 45)
let hulk = Person(name: "Bruce Banner", age: 40)
let captain = Person(name: "Steve Rogers", age: 29)
let spiderman = Person(name: "Peter Parker", age: 16)

let tesla = Car(isElectric: true, model: "Roadster", price: 120000)
let porsche = Car(isElectric: false, model: "911", price: 250000)
let ferrari = Car(isElectric: false, model: "GTO", price: 1000000)
let nissan = Car(isElectric: true, model: "Leaf", price: 30000)

let arrayToVisit: [Visitable] = [ironman, spiderman, tesla, porsche]
let dictionnaryToVisit: [String: Visitable] = [ "key1": hulk,
                                                "key2": captain,
                                                "key3": ferrari,
                                                "key4": nissan,
                                                "key5": arrayToVisit]

let anyVisitor = AnyVisitor()
dictionnaryToVisit.accept(visitor: anyVisitor)

/// will print:
/// Leaf's price is 30000.0$
/// Tony Stark is 45 years old
/// Roadster's price is 120000.0$
/// Bruce Banner is 40 years old
```

To visit a bunch of **Visitables**, all you have to do is adding them to a container such as an **Array** or a **Dictionnary** and visit this one. From the Developer perspective, only the **AnyVisitor** has to be implemented.

## Be careful with auto-completion

There is a small drawback in using **conditional conformance** with XCode. If we get back to our **Resettable** example, **Bool** is not Resettable but if we declare an **Array&lt;Bool&gt;**, XCode will offer the **reset()** function with the auto-completion.

Of course the compiler will then inform you that Bool is not a Resettable … but still, perhaps XCode could have been more restrictive !
Not that big a deal 😊 but I had to point that out.

I hope you enjoyed this first take on conditional conformance. New usages will come out for sure in the weeks to come.

Stay tuned.

