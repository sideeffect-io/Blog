---
title: Versatile Namespace
date: 2017-11-22
description: In Swift, some APIs such as RxSwift use a technic that confines the code they’re exposing in a dedicated namespace. In this post we will figure out how this is done in the most generic and versatile way.
tags: tips
image: images/2017-11-22-VersatileNamespace/space.jpg
---

In Swift, some APIs such as RxSwift use a technic that confines the code they’re exposing in a dedicated namespace. In this post we will figure out how this is done in the most generic and versatile way.

```swift
let myButton = UIButton()
myButton.rx.tap.subscribe(…) // this is a RxCocoa kind of code
```

Have you ever wondered how is it possible in Swift to write such a line of code ?

This is the **.rx.** part that seems awkward at first glance, isn’t it ? It acts like some kind of custom namespace.

* Is this a variable ?
* Is this an inner class ?

We have some clues to figure that out:

* As it is accessible via a dot notation. it must be a member of the UIButton class
* It as some properties such as **tap**, so it is a data structure

With these two clues we can try to make our very own namespace.

# Step 1: The naive and not so useful approach

In the following examples we will try to add a custom name space to UIButton that exposes a single function **hello**.

As the namespace must be a data structure, let’s try with a Swift struct:

```swift
struct ButtonNameSpace {
    func hello () {
        print ("Hello")
    }
}
```

So far so good. Since the namespace should be a member of UIButton, we will add it as a computed property:

```swift
extension UIButton {
    var nameSpace: ButtonNameSpace {
        return ButtonNameSpace()
    }
}
```

Now, we can use it like that:

```swift
let myButton = UIButton()
myButton.nameSpace.hello()
```

The result of this call will be: “**Hello**”.

What can this be used for ? Nothing interesting I would say because in the namespace we cannot access the UIButton properties and functions. We will only do some UIButton external stuff, it would be great to add some **context**&nbsp;to our namespace.

# Step 2: The useful approach

In order to access the UIButton properties and functions, we have to give a reference on this button to the data structure used for the namespace.

```swift
struct ButtonNameSpace {
    private let button: UIButton

    init(with button: UIButton) {
        self.button = button
    }

    func hello () {
        let title = self.button.title(for: .normal) ?? ""
        print ("Hello \(title)")
    }
}
```

The **ButtonNameSpace** struct holds a reference on the UIButton that creates it.

We still add a computed property to UIButton, and when the **ButtonNameSpace** is created, we pass a reference to the button itself. We can now access the button properties, such as the **title**.

```swift
extension UIButton {
    var nameSpace: ButtonNameSpace {
        return ButtonNameSpace(with: self)
    }
}
```

We can still use it like that:

```swit
let myButton = UIButton()
myButton.setTitle("My button", for: .normal)
myButton.nameSpace.hello()
```

The result of this call will be: “**Hello My Button**”. The namespace makes a lot more sense here as it is related to the object within which it is created.

What if we had to write a namespace for UIImage for instance ? In the actual approach we should declare a **ImageNameSpace**&nbsp;struct as well.

Actually the true goal of such a struct is to hold a reference on the object in which it is created. It sounds like generics could be involved in this ? No ?

# Step 3: The best approach

The answer is **YES**. This struct **MUST** be generic.

```swift
struct MyNameSpace<Base> {
    private let base: Base

    init(with base: Base) {
        self.base = base
    }
}
```

As we can see, the only purpose of this struct is to hold a reference on **something**&nbsp;that is given as an init parameter so that we can access it in further calls.

Now, we can use something really great in Swift: **conditional extensions**. It will allow us to add features to this struct only and only if **Base**&nbsp;matches the type we want. For instance, if **Base**&nbsp;is a **UIButton**&nbsp;we add a **Hello**&nbsp;function that will perform the same stuff than the old **ButtonNameSpace**:

```swift
extension MyNameSpace where Base: UIButton {
    func hello () {
        let title = self.base.title(for: .normal) ?? ""
        print ("Hello \(title)")
    }
}
```

Instead of accessing **self.button.title**, we can access **self.base.title**&nbsp;as we know that **base** is a UIButton for sure. We can add a computed property to UIButton by taking care of the name space genericity.

```swift
extension UIButton {
    var myNameSpace: MyNameSpace<UIButton> {
        return MyNameSpace(with: self)
    }
}
```

The usage and the result are still the same.

```swift
let myButton = UIButton()
myButton.setTitle("My button", for: .normal)
myButton.myNameSpace.hello()
```

Let’s get back to the UIImage case. It is no more necessary to define a dedicated namespace struct, we can use our generic one combined to a new conditional extension.

```swift
extension UIImage {
    var myNameSpace: MyNameSpace<UIImage> {
        return MyNameSpace(with: self)
    }
}

extension MyNameSpace where Base: UIImage {
    func hello () {
        let title = self.base.accessibilityHint ?? ""
        print ("Hello \(title)")
    }
}

let myImage = UIImage()
myImage.accessibilityHint = "My Image"
myImage.myNameSpace.hello()
```

In fact this is exactly the way RxSwift has implemented the **rx**&nbsp;name space as we can see here: [Reactive.swift](https://github.com/ReactiveX/RxSwift/blob/0b66f666ba6955a51cba1ad530311b030fa4db9c/RxSwift/Reactive.swift)

Hope this helps.

Stay tuned.
