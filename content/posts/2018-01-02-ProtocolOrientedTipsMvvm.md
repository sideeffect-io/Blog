---
title: Protocol Oriented Tips For MVVM in Swift
date: 2018-01-02
description: Hi folks. Lately MVVM has become some sort of standard as an architecture for iOS apps. It offers a good separation of concerns, a good way to format data and great view binding mechanisms with frameworks such as RxSwift. In this post I will give few tips I use to ease the implementation of this pattern.
tags: tips, architecture
image: images/2018-01-02-ProtocolOrientedTipsMvvm/POP-MVVM.png
---

Hi folks. Lately MVVM has become some sort of standard as an architecture for iOS apps. It offers a good separation of concerns, a good way to format data and great view binding mechanisms with frameworks such as RxSwift. In this post I will give few tips I use to ease the implementation of this pattern.

# Views made easy with Reusable
With MVVM, separation between Views and the rest of your architecture is very clear. Views include UIViewControllers and their outlets. As a matter of fact, instantiating Views becomes more and more important, especially since patterns such as Coordinator gain in popularity. We will assume in the rest of this article that you are implementing this kind of architecture.

Reusable is an API that comes with handy extensions to UIViews and UIViewControllers that ease their instantiation in a type safe manner.

Here is the GitHub repo: [Reusable](https://github.com/AliSoftware/Reusable). It is a lightweight API compatible with Carthage, CocoaPods and SPM. It would be a shame not to use it regarding the happiness it brings 🖖.

Basically, Reusable provides mixins (Protocols with default implementation) that will add instantiation functions to UIViews and UIViewControllers, as soon as you make them conform to the appropriate protocol.

While using Coordinator pattern, at some point you will want to instantiate UIViewControllers and pass them ViewModels. Lucky you, because Reusable helps a lot in doing that.

Here are the things you have to do to use Reusable for UIViewControllers instantiation:

* Create a Storyboard file per UIViewController (of course it is possible to have several UIViewControllers in the same storyboard, but for the sake of the simplicity we will consider only one UIViewController)
* Set the UIViewController as the initial ViewController in the scene
* Create a UIViewController file in which the ViewController class name is the same as the Storyboard file name. For instance if the Storyboard file is named “SettingsViewController.storyboard”, then the UIViewController class will be named “SettingsViewController”
* Make the UIViewController implement the Protocol “StoryboardBased”

And that’s it. You can now instantiate the ViewController with a single line of code:

```swift
let settingsViewController = SettingsViewController.instantiate()
```

What is cool about that is that settingsViewController’s type is SettingsViewController without the need for a cast statement.

In fact the StoryboardBased protocol is pretty straight forward. Let’s dive into it:

```swift
public protocol StoryboardBased: class {
  static var storyboard: UIStoryboard { get }
}

public extension StoryboardBased {
  static var storyboard: UIStoryboard {
    return UIStoryboard(name: String(describing: self), bundle: Bundle(for: self))
  }
}

public extension StoryboardBased where Self: UIViewController {
  static func instantiate() -> Self {
    guard let vc = storyboard.instantiateInitialViewController() as? Self else {
      fatalError("The VC of \\(sceneStoryboard) is not of class \\(self)")
    }
    return vc
  }
}
```

Basically, what it does is providing a static “instantiate” function to each UIViewController that implements the Protocol. This function returns an instance of the UIViewController. As “Self” is the return type of the function, type inference assures we won’t have to cast the result.

I strongly encourage you to take a deep look at Reusable. It will be also helpful when it comes to instantiate UIViews from Xib or dequeue UITableViewCells in a type safe way.

# Protocol oriented ViewModels
Coordinator-like architectures are common in nowadays applications, especially when being combined to a MVVM pattern. That is why I wished to talk about Reusable in the first place.

But there is a trick that I find very useful and complementary to Reusable. It fits very well with the MVVM pattern in a Protocol Oriented approach.

The idea is not only to ease the instantiation of UIViewControllers but also to provide a nice way to pass them their associated ViewModels. Let’s write a Protocol that defines what it is to have a ViewModel.

```swift
protocol ViewModelBased: class {
    associatedtype ViewModel
    var viewModel: ViewModel { get set }
}
```

We can now mix it with StoryboardBased and provide a static function that instantiates a UIViewController with a ViewModel as a parameter.

```swift
extension ViewModelBased where Self: StoryboardBased & UIViewController {
    static func instantiate (with viewModel: ViewModel) -> Self {
        let viewController = Self.instantiate()
        viewController.viewModel = viewModel
        return viewController
    }
}
```

Conditional extension is a very powerful tool. The “where” statement that combines “StoryboardBased” and “UIViewController” makes the Self.instantiate function available, so we just have to wrap this call in another static function that sets the UIViewController.viewModel property

Let’s say we have a MyViewController that conforms to the ViewModelBased protocol:

```swift
class MyViewController: UIViewController, StoryboardBased, ViewModelBased {
    var viewModel: MyViewModel!

    override func viewDidLoad() {
        super.viewDidLoad()
    }
}
```

Its instantiation with the ViewModel will be super easy:

```swift
let myViewController = MyViewController.instantiate(with: MyViewModel())
```

# Let’s go further in ViewModel abstraction

In what we’ve done so far, we still have to instantiate the ViewModel and give it to the View. Wouldn’t it be nice to just instantiate the View and let it deal with the ViewModel instantiation in a generic way ? Swift type inference can help a lot in doing so.

Before we dive into the code, I’d like to warn you that some may say this technic introduce a strong coupling between the View and the ViewModel. In a way this is true, but depending on the amount of time, energy, complexity allocated to your app, it can be an efficient strategy anyway.

First of all we will define WHAT is a ViewModel. Of course we will use a Protocol for that. And by doing so, we’ll introduce the notion of Services. Services are low level layers that are needed by the ViewModel to retrieve data or perform actions.

```swift
protocol ViewModel {
    associatedtype Services
    init (withServices services: Services)
}
```

We have to amend the ViewModelBased definition to introduce the ViewModel protocol in the associated type.

```swift
protocol ViewModelBased: class {
    associatedtype ViewModelType: ViewModel
    var viewModel: ViewModelType { get set }
}
```

Finally we can adapt the ViewModelBased extension like this:

```swift
extension ViewModelBased where Self: StoryboardBased & UIViewController {
    static func instantiate<ServicesT> (withServices services: ServicesT) -> Self
    where ServicesT == Self.ViewModelType.Services {
        let viewController = Self.instantiate()
        viewController.viewModel = ViewModelType(withServices: services)
        return viewController
    }
}
```

There are 2 main differences between this version and the previous one:

* the first difference is obvious: this static function not only instantiates the UIViewController but also the ViewModel. That’s one thing the developper won’t have to do anymore 👍
* the second difference is the function signature. It now takes some kind of Services as a parameter. As you can see, this is a generic function. The “where” statement forces the developper to pass a ServicesT that is the same as the one required in the ViewModelType. This brings safety and consistency 👍

What is great here is that Swift will infer the ViewModelType according to the ViewModelBased implementation.

Let’s see this in action.

First thing first, we have to define a dumb Service for the sake of this demonstration:

```swift
class MyService {
    func executeService() {
        print ("Service execution")
    }
}
```

We can now define a ViewModel that needs this Service:

```swift
struct MyViewModel: ViewModel {
    typealias Services = MyService

    init(withServices services: Services) {
        services.executeService()
    }
}
```

MyViewController instantiation with its ViewModel becomes that easy (considering that we already have a MyService instance):

```swift
let myViewController = MyViewController.instantiate(withServices: myService)
// we can access the inner ViewModel if needed: myViewController.viewModel
```

# Protocol composition for Services

Although this seems pretty handy, there is one drawback to this pattern: what if a ViewModel needs several Services ?

One solution would be to pass some kind of container that provides ALL the services of your application. This would work, but not very safe because the ViewModel could use every services of the container without restriction.

I once read a [post from Krzysztof Zablocki](http://merowing.info/2017/04/using-protocol-compositon-for-dependency-injection/) about this issue and I though it would work very gently with my ViewModel approach.

Let’s say our application needs 3 services:

```swift
class Service1 {
    func executeService1() {
        print ("execution of Service1")
    }
}

class Service2 {
    func executeService2() {
        print ("execution of Service2")
    }
}

class Service3 {
    func executeService3() {
        print ("execution of Service3")
    }
}
```

The idea is to use Protocol composition to express the services we need in our ViewModel. We will define a Protocol per Service that grants access to it:

```swift
protocol HasService1 {
    var service1: Service1 { get }
}

protocol HasService2 {
    var service2: Service2 { get }
}

protocol HasService3 {
    var service3: Service3 { get }
}
```

In our ViewModels we now have the ability to clearly define our dependancies, with a fine granularity:

```swift
struct MyViewModel: ViewModel {

    // thanks to protocol composition we define only the services we want to use
    typealias Services = HasService1 & HasService2

    init(withServices services: Services) {
        services.service1.executeService1()
        services.service2.executeService2()
    }
}

struct MyOtherViewModel: ViewModel {
    typealias Services = HasService2 & HasService3

    init(withServices services: Services) {
        services.service2.executeService2()
        services.service3.executeService3()
    }
}
```

The last step is to define the dependancy container:

```swift
class MyServices: HasService1, HasService2, HasService3 {
    let service1 = Service1()
    let service2 = Service2()
    let service3 = Service3()
}
```

And we’re good to go, we can now pass the container to our ViewModels with a decent safety but a great scalability. If we need to access another Service inside a ViewModel, we just have to update the protocol composition.

At the end, UIViewController instantiation is the same (consider that MyViewController2 is a ViewModelBased VC):

```swift
let myViewController = MyViewController.instantiate(withServices: myServices)
let myViewController2 = MyViewController2.instantiate(withServices: myServices)
// This is the same myServices instance for the 2 ViewControllers
// but each ViewModel will only access what's needed
```

Et voila 👌.

I hope this helps.

Stay tuned.
