---
title: Property Wrappers In Swift 5.1, The Missing Published Implementation
date: 2019-06-18
description: It’s been an amazing WWDC this year. SwiftUI and Combine were some big announcements of the conference. They will have a huge impact on our daily life as iOS developers.
tags: language
image: images/2019-06-18-PropertyWrappers/wrapper.png
---

It’s been an amazing WWDC this year. **SwiftUI** and **Combine** were some big announcements of the conference. They will have a huge impact on our daily life as iOS developers.

* [**SwiftUI**](https://developer.apple.com/xcode/swiftui/) is Apple’s new framework for writing user interfaces natively on all Apple platforms in a declarative and highly composable way.

* [**Combine**](https://developer.apple.com/documentation/combine) is Apple’s new unified declarative framework for processing values over time. This is a roundabout way of talking about reactive programming, of which RxSwift and ReactiveCocoa are the ambassadors.

This article is not truly about these frameworks. It is about a feature that powers SwiftUI and makes Combine easily compliant with UIKit: **property wrappers**.

# Property Wrappers

Also known as **property delegates**, property wrapper is not yet part of the Swift language (version 5.0.1 at the time of this writing). It will be available with Swift 5.1. If you want to dive into its philosophy, please take a look at the [Swift Evolution Proposal SE-0258](https://github.com/apple/swift-evolution/blob/master/proposals/0258-property-delegates.md).

My main goal here is not to make a deep and exhaustive review of the theory and implementation behind **property wrappers**, but to expose a concrete use case. A case presented during the WWDC in the talk “[Combine in practice](https://developer.apple.com/videos/play/wwdc2019/721)” involved @Published as a way to transform a traditional Swift property into a Combine **Publisher**. Although Apple introduced this property wrapper in the talk, it is not yet available in the first beta of Swift 5.1. This is the reason why I think it’s interesting to imagine the way Apple could have implemented it.

Before implementing @Published, we will see how property wrappers can be put to use.

# What is a property wrapper?

Basically, a property wrapper is a generic data structure that encapsulates read/write access to a property while adding some extra behavior to “_augment_” its semantics.

Let’s implement a very basic (and maybe simplistic?) example: what if we want to forbid Optionals we use in our program to be nil?

We will implement a **property wrapper** that forces this property to a default value when it mutates to a nil value:

![](/images/2019-06-18-PropertyWrappers/1.png)

> This property wrapper encapsulates the access to the property: “var value: Value?”

The Swift compiler will generate a **@ConstrainedOptional** annotation (named after the **ConstrainedOptional** property wrapper struct) that will apply the specified behavior to the annotated variable whenever it’s mutated.

![](/images/2019-06-18-PropertyWrappers/2.png)

We can even add extra features to the property wrapper itself:

![](/images/2019-06-18-PropertyWrappers/3.png)

We can then access the property wrapper dedicated features by prefixing the variable name with “**$**”:

![](/images/2019-06-18-PropertyWrappers/4.png)

In doing so, we can access the value of the counter without having to force unwrap it (there is not magic behind that of course, the force unwrapping is provided by the property wrapper).

### Using property wrapper to manage persistence

As I mentioned earlier, the original name of property wrapper is **property delegate** **(@propertyDelegate** is still available in Xcode). This naming makes a lot of sense when it comes to inform a third party actor that a property has changed so it can execute some code.

Let’s say we want to read/write a value from/to a database each time a property is accessed/modified. A first approach could be to use a computed property like this:

![](/images/2019-06-18-PropertyWrappers/5.png)

> CodableDAO is a tool that abstracts the storage of any value conforming to Codable

What will soon be annoying is the need to write this for every property we want to persist with the CodableDAO.

Let’s encapsulate this inside a property wrapper:

![](/images/2019-06-18-PropertyWrappers/6.png)

> Note that it is allowed to constrain the generic type of a property wrapper to conform to a protocol **👌**

We can now annotate any Codable conforming property with **@Persisted:**

![](/images/2019-06-18-PropertyWrappers/7.png)

When mutated, the “**user**” and “**country**” properties will be persisted under the hood. The **@Persisted** property wrapper handles all the storage work for us 👍.

#### Leveraging property wrapper to ease protocol conformance

As we saw, property wrappers can be used to add additional behaviors or to change the underlying storage of a property.

We can bend it to fulfill another goal: make a type “_almost_” conform to a protocol without having to make use of an extension.

Swift 5.1 introduced “**Identifiable**”. It’s a protocol used in SwiftUI to uniquely identify rows in a List component. The only requirement for this protocol is to provide an “**id**” property.

Let’s make String conform to this protocol in a traditional approach:

![](/images/2019-06-18-PropertyWrappers/8.png)

Unfortunately, as extensions cannot have stored properties, the **id** value will be computed every time we access it.

![](/images/2019-06-18-PropertyWrappers/9.png)

Two different ids for the very same value 😩. This is not the expected behavior for an Identifiable data.

Let a propery wrapper endorse the responsibility to be **_Identifiable_**:

![](/images/2019-06-18-PropertyWrappers/10.png)

> Note the Identifiable conformance of UUIDIdentified

As “**id**” is a constant in the property wrapper, it does not change over time.

![](/images/2019-06-18-PropertyWrappers/11.png)

Again, this is not necessarily what property wrappers are made for. They are made to act as a delegate for read/write access on a wrapped value, but I want to share this technique to get feedback from the community and to show that a property wrapper can itself conform to a protocol if needed.

# Implementing @Published

We now have a solid understanding about property wrappers to make a reasonable guess about Apple’s implementation of **@Published**.

If you are not familiar with the concept of Publisher introduced with Combine, it is similar to what an Observable is in RxSwift for instance.

As stated in the talk [Combine in practice](https://developer.apple.com/videos/play/wwdc2019/721), annotating a property with @Published allows us to transform this property into a stream of its successive values. Basically, it will be used to make UIKit outlets compliant with Combine streams.

In the following ViewController, we listen for UITextField updates. For each one of these, we set the value of a String property named “username” annotated with @Published.

The @Published property wrapper makes **$username** be a Publisher that we can subscribe to.

![](/images/2019-06-18-PropertyWrappers/12.png)

Here is my implementation of the @Published property wrapper. Every time the value is set, we also feed a Combine **PassthroughSubject** that can then be listened as a Publisher.

![](/images/2019-06-18-PropertyWrappers/13.png)

> **Note there is a possible (and shorter) implementation with a CurrentValueSubject depending on the wish to always retrieve the current value when subscribing to it.**

Since Publisher is a protocol, we can make the wrapper conform to it by forwarding the “**receive**” function to the inner PassthroughSubject.

![](/images/2019-06-18-PropertyWrappers/14.png)

That’s it. Any property annotated with @Published can also be seen as a Combine Publisher 👍.

# Conclusion

Property wrappers are very powerful and can help reduce a great amount of boilerplate code. That’s a strength, but unfortunately also a danger.

Overusing it like this:

![](/images/2019-06-18-PropertyWrappers/15.png)

could lead to the inability to understand the meaning of a program, the logic being spread in all the wrappers.

It reminds me of the kind of drawbacks a paradigm like [Aspect Oriented Programming](https://en.wikipedia.org/wiki/Aspect-oriented_programming) can have. Somehow, property wrappers can be seen as [Aspects](https://en.wikipedia.org/wiki/Aspect_%28computer_programming%29) in our code flow.

Time will tell us how to regulate their usage. Perhaps property wrappers should be restricted to Apple frameworks and Important third party APIs 🧐.

Like custom operators, it can be a killer tool, but it can also blur the lines so much that you or your colleagues cannot understand your code anymore.

I look forward to how this will evolve in the next beta releases of Swift 5.1.

Stay tuned.
