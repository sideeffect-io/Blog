---
title: RxFlow Part 3 - Tips and tricks
date: 2017-12-22
description: This is the final chapter of our journey within RxFlow. I’ve already exposed all the key features/principles of the framework in these 2 previous parts, let’s dive into some tips and tricks I used thanks to Reactive Programming.
tags: open source, reactive programming
image: images/2017-12-22-RxFlow-Part3/RxFlow_Logo.png
---

This is the final chapter of our journey within **RxFlow**. I've already exposed all the key features/principles of the framework in these 2 posts:

* [RxFlow Part 1: In Theory](/posts/2017-11-08-RxFlow-Part1/)
* [RxFlow Part 2: In Practice](/posts/2017-12-09-RxFlow-Part2/)

Let's dive into some tips and tricks I used thanks to Reactive Programming.

# UIViewControllers made Reactive

As we saw in part 2, we needed, at some point, to know when a **Presentable** was displayed or not, in a Reactive way. A Presentable exposes 3 Observables:

```swift
/// Observable that triggers a bool indicating if
/// the current Presentable is being displayed
var rxVisible: Observable<Bool> { get }

/// Single triggered when this presentable is displayed
/// for the first time
var rxFirstTimeVisible: Single<Void> { get }

/// Single triggered when this presentable is dismissed
var rxDismissed: Single<Void> { get }
```

In **RxFlow**, UIViewController conforms to this Protocol, therefore we must find a way to make them Reactive.

Hopefully a great project that have discovered along the way has helped a lot in doing this:&nbsp;[RxViewController](https://github.com/devxoul/RxViewController).

It gives a Reactive extension to UIViewControllers by applying the pattern I describe in this post: [Verstatile name space in Swift](/posts/2017-11-22-VersatileNamespace/). Moreover it uses RxCocoa built-in functions that allows to observe selector calls. Once I had understood the concept I made my own extension to UIViewController.

```swift
extension Reactive where Base: UIViewController {

    /// Observable, triggered when the view has appeared for the first time
    public var firstTimeViewDidAppear: Single<Void> {
        return sentMessage(#selector(Base.viewDidAppear)).map { _ in
            return Void()
        }.take(1).asSingle()
    }

    /// Observable, triggered when the view is being dismissed
    public var dismissed: ControlEvent<Bool> {
        let source = sentMessage(#selector(Base.dismiss))
                     .map { $0.first as? Bool ?? false }
        return ControlEvent(events: source)
    }

    /// Observable, triggered when the view appearance state changes
    public var displayed: Observable<Bool> {
        let viewDidAppearObs = sentMessage(#selector(Base.viewDidAppear))
                               .map { _ in true }
        let viewWillDisappearObs = sentMessage(#selector(Base.viewWillDisappear))
                                   .map { _ in false }
        return Observable<Bool>.merge(viewDidAppearObs, viewWillDisappearObs)
    }
}
```

For the record, this is how It is used by the **Coordinator**, where "nextPresentable" is the **Presentable** that has been produced by a "**navigate(to:)**" function on a **Flow**. We only listen for the next **Stepper** after the very first display of the associated **Presentable**.

```swift
nextPresentable.rxFirstTimeVisible.subscribe(onSuccess: { [unowned self,
                                                           unowned nextPresentable,
                                                           unowned nextStepper] (_) in
    // we listen to the presentable's Stepper.
    // For each new Step value, we trigger a new navigation process
    // this is the core principle of the whole RxFlow mechanism
    // The process is paused each time the presentable is not currently displayed
    // for instance when another presentable is above it in the VCs hierarchy.
    nextStepper.steps
        .pausable(nextPresentable.rxVisible.startWith(true))
        .asDriver(onErrorJustReturn: NoStep())
        .drive(onNext: { [unowned self] (step) in
            // the nextPresentable's Stepper fires a new Step
            self.steps.onNext(step)
        }).disposed(by: nextPresentable.disposeBag)

}).disposed(by: self.disposeBag)
```

# Let's take a pause

Another key principle in **RxFlow** is: what happens in a **Flow**, stays in a **Flow**. Therefore, I had to find a way to "pause" the **Steps**' subscriptions if the **Flow** was not on the top of the view hierarchy anymore.

RxSwift does not provide "out of the box" a way to pause a subscription, but [RxSwiftExt](https://github.com/RxSwiftCommunity/RxSwiftExt) does. This is a project from the [RxSwiftCommunity](https://github.com/RxSwiftCommunity). It adds a lot of new operators to RxSwift, such as "[pausable](https://github.com/RxSwiftCommunity/RxSwiftExt#pausable)".

> It pauses the elements of the source observable sequence unless the latest element from the second observable sequence is true.

Let's take a look at the implementation.

```swift
extension ObservableType {

    /// Pauses the elements of the source observable sequence based on
    /// the latest element from the second observable sequence.
    /// Elements are ignored unless the second sequence has most recently
    /// emitted `true`.
    /// - Parameter pauser: The observable sequence used to pause the source
    /// observable sequence.
    /// - Returns: The observable sequence which is paused based upon
    /// the pauser observable sequence.
    public func pausable<P: ObservableType> ( _ pauser: P) -> Observable<E>
                                                              where P.E == Bool {
        return withLatestFrom(pauser) { element, paused in
            (element, paused)
            }.filter { _, paused in
                paused
            }.map { element, _ in
                element
        }
    }
}
```

In fact, this is just a combination of 3 RxSwift built-in operators:

* withLatestFrom: which associates to the value triggered by the main Observable, the last value of another Observable called "pauser" (the one that drives the pause)
* filter: which only accepts values from the "pauser" Observable that are true
* map: which ignores the pauser Observable values so that only the value that is returned is the one from the main Observable

Again, this is how it is used by the **Coordinator**:

```swift
nextStepper
    .steps
    .pausable(nextPresentable.rxVisible.startWith(true))
    .asDriver(onErrorJustReturn: NoStep())
    .drive(onNext: { [unowned self] (step) in
        // the nextPresentable's Stepper fires a new Step
        self.steps.onNext(step)
    }).disposed(by: nextPresentable.disposeBag)
```

The is very straightforward to read: nextStepper's **Steps** are paused when values from "rxVisible" Observable are false.

# Protocols with stored properties ?

Being a Protocol Oriented framework, **RxFlow** wants the developer to implement several Protocols. When you build that kind of framework, you don't want the user to struggle with too much functions or properties he would have to implement to fulfill those protocols.

Functions are not a problem, as you can provide default implementation with Protocol extensions. But properties are an issue, because Swift does not allow to store them in such an extension.

For instance, when you implement the **Stepper** Protocol, you are offered a "**step**" property that allows to trigger new **Step** values. How did I do this ?

Again the RxSwiftCommunity was of great help here. I was inspired by&nbsp;[NSObject-Rx](https://github.com/RxSwiftCommunity/NSObject-Rx). This project proposes an extension to NSObject that stores a RxSwift DisposeBag. The aim is to provide a default DisposeBag to every class that extends NSObject, in particular UIViewControllers. It was precisely what I needed but in a protocol extension. Here is the code of Stepper.

```swift
private var subjectContext: UInt8 = 0

/// a Stepper has only one purpose: emit Steps that correspond to
/// specific navigation states.
/// The state changes lead to navigation actions in the context of
/// a specific Flow
public protocol Stepper: Synchronizable {

    /// the Rx Obsersable that will trigger new Steps
    var steps: Observable<Step> { get }
}

public extension Stepper {

    /// The step in which to publish new Steps
    public var step: BehaviorSubject<Step> {
        return self.synchronized {
            if let subject = objc_getAssociatedObject(self, &subjectContext)
                             as? BehaviorSubject<Step> {
                return subject
            }
            let newSubject = BehaviorSubject<Step>(value: NoStep())
            objc_setAssociatedObject(self,
                                     &subjectContext,
                                     newSubject,
                                     .OBJC_ASSOCIATION_RETAIN_NONATOMIC)
            return newSubject
        }
    }

    /// the Rx Obsersable that will trigger new Steps
    public var steps: Observable<Step> {
        return self.step.asObservable()
    }
}
```

All the magic happens in the "**step**" computed property. We use the "objc_setAssociatedObject" function to store a reference to a BehaviorSuject ([see this NSHipster article](http://nshipster.com/associated-objects/)). Each time this property is accessed, we retrieved this stored reference (at the first call, the BehaviorSubject is created and associated to the subjectContext reference).

There is a drawback to this trick. Protocols can be adopted by value types such as Structs which means memory is handled in the stack, not in the heap (like reference types). Therefore the lifecycle and reusability of a Struct instance are handled by the Swift runtime. When the runtime is going to reuse an instance it is not sure what happens to the "objc_getAssociatedObject" associated value. To make it safe, this kind of protocol should be constraint to be implemented by a class only, this will ensure that everything happens in the heap.

# Give it back to community

As you can see, some key features in RxFlow are based on work done by the developers community. It is something you have to consider when you open source a project on your own: You will need help ! I think this is important to give it back to the community.

In RxFlow's case, I had the opportunity to open 2 PRs that have been merged:

* [Rehabilitates the HasDisposeBag protocol](https://github.com/RxSwiftCommunity/NSObject-Rx/pull/49)
* [Add new observables for displayed and dismissed states](https://github.com/devxoul/RxViewController/pull/4)

It felt really good to know that my code could help other developers.

# Conclusion

It has been quite a challenge to make my first open source project available. This was NOT as easy as one can think because you have to:

* gather and synthesize all the ideas that have led you to your project (ideas from former projects, problems and solutions you've encountered, …). So take it easy and think about it before coding anything :-)
* try to pick the appropriate patterns according to the complexity of your project, do not over engineer your work
* think as if you were the guy who will use your code, keep it as simple as possible (this is the hardest thing)
* write a good README because the code is not enough to make your project attractive
* be professional with your sources management. Nobody wants to contribute to a project that seems ugly (git CLI is your best friend)
* try to write blog articles to share your work, you will get feedback from smart people
* keep the faith, you will be discouraged from time to time. So give it a break if you are overwhelmed, do some brain washing, and ideas will come back later.

RxFlow is out in version 2.9.0 on CocoaPods, Cartage and SPM.

RxFlow Github repo: [https://github.com/RxSwiftCommunity/RxFlow](https://github.com/RxSwiftCommunity/RxFlow)

Stay tuned.
