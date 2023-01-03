---
title: RxReduce - Reactive State Container Architecture Part 2
date: 2018-06-25
description: As we saw in “RxReduce - A Reactive State Container Architecture Part 1”, State is a central concern in applications. I strongly invite you to take a look at this first article. So far, we haven’t introduced the concept of Reactive Programming and how it can address some issues I’ve encountered in traditional implementations of State Containers. We will see how RxReduce, an open source framework of the RxSwiftCommunity, can help you handle the State, its mutations, and the asynchronous work related to the side effects, in a Reactive way.
tags: architecture, reactive programming, open source
image: images/2018-06-25-RxReduce-Part2/RxReduce_Logo.png
---

As we saw in [RxReduce: A Reactive State Container Architecture Part 1](/posts/2018-06-24-RxReduce-Part1), **State** is a central concern in applications. I strongly invite you to take a look at this first article. So far, we haven't introduced the concept of Reactive Programming and how it can address some issues I've encountered in traditional implementations of **State Containers**. We will see how [RxReduce](https://github.com/RxSwiftCommunity/RxReduce), an open source framework of the RxSwiftCommunity, can help you handle the **State**, its mutations, and the asynchronous work related to the side effects, in a Reactive way.

# The concerns

* Store uses the Observer pattern: One of the responsibilities of the **Store** is to propagate the **State** mutations to the rest of the application. To do so, it is common to use an **Observer** pattern, so that observers will be notified of new **State** values. In a traditional approach, observers will register/unregister themselves to the **Store** which implies a lot of boilerplate code to deal with that.
* Side effects: In [part 1](/posts/2018-06-24-RxReduce-Part1) we saw that side effects (mostly asynchronous work) could not be handled by the **Store/Reducers**. It is a requisite for **State** reproducibility and testability. But as we all know, side effects are very usual and somehow mandatory in every applications. Using an architecture that only says "eh, you should do the side effects outside the state mutations" can be a little frustrating and annihilate the will to implement it.

# RxReduce

[RxReduce](https://github.com/RxSwiftCommunity/RxReduce) is born from my willing to test patterns like [Redux](https://redux.js.org) in a native mobile application. I had a significant experience with MVC, MVP and MVVM, but I was curious about **State** management.&nbsp;

**State** is obviously something I already had to deal with in more traditional architectures. I ended up, having low level layers, such as "**services**" layers, exposing my **Model** via RxSwift Observables. It was a good start, but Model is not truly a state and it was spread all across my services: not ideal to guarantee a global consistency.

I had to go further in my understanding of **State** management but with the aim to address the previous concerns about the Observer pattern and the side effects.&nbsp;

[**RxReduce**](https://github.com/RxSwiftCommunity/RxReduce):

* provides a generic **Store** that can handle all kinds of **States.**
* exposes **State** mutations through a Reactive mechanism.
* provides a simple/unified way to mutate the **State** synchronously and asynchronously via **Actions.**

In the rest of this article, I assume you are familiar with the basics of Reactive Programming in general, and RxSwift in particular. If you are not, there are plenty of great ressources on the web 👌.

## RxReduce terminology

You can browse the repo here:&nbsp;[https://github.com/RxSwiftCommunity/RxReduce](https://github.com/RxSwiftCommunity/RxReduce).

**RxReduce** is compatible with CocoaPods and Carthage. It is a very tiny library consisting in three protocols, one class and two typealiases:

* **StoreType**: a protocol describing what should be a **Store**. Although it is a public protocol, you shouldn't need to implement your own as RxReduce provides a default **Store**.
* **State**: an empty protocol used to identify a **State** in the **Store**, nothing special to implement here.
* **Action**: a protocol used to identify an **Action** in the dispatch function of a **Store**. A single function is to be implemented: "toAsync()", but RxReduce provides default implementations for that, nothing special to do here (explanations to come later in the "Conditional Conformance is magic" chapter).&nbsp;&nbsp;
* **Store**: a class representing a default **Store** capable of dispatching synchronous or asynchronous **Actions** inside **Reducers** and **Middlewares**. A **Store** exposes the mutated **State**. You can have several **Stores** in your app, each one taking care of a dedicated **State**, but you should consider dealing with a unique **Store** for the sake of simplicity and **State** tracking.
* **Reducer**: a typealias for a pure generic function taking an **Action**, a **State** and returning a new **State**. You will have to provide at least one **Reducer** in the **Store** initialization. Of course it is also possible to add several **Reducers** so you can separate responsibilities. **Reducers** are applied in sequence when dispatching an **Action** to the **Store**.
* **Middleware**: a typealias for a pure generic function taking an **Action**, a **State** and returning … nothing. Basically you can see it as a **Reducer** having no mutation powers. It will be called before **Reducers** when dispatching an **Action** to the **Store**. **Middlewares** are useful for logging purposes for instance.

## State drives your UI

> State is the heart of your application, by definition ! ([RxReduce: A Reactive State Container Architecture Part 1](/posts/2018-06-24-RxReduce-Part1))

An application is just the reflection of a **State** at a given time. Regarding that, the title of this chapter is not a coincidence.

Using a **RxSwift Driver** is the way RxReduce exposes the **State** mutations to the outside world, particularly to the UI. As a reminder, a **Driver** is an Observable that cannot fail and only emits events on the main Thread, it makes sense for a **State**.

Listening to the **State** mutations raises some fundamental questions:

* what if I don't want to be notified by a **State** mutation that happens on a part of the **State** I'm not interested in ?
* what if the **State** is replaced by a new value that is strictly equal ? Will the notification mechanism trigger unnecessary UI updates ?

That deserves a little explanation 😀. Let's say our **State** is a **struct** representing:

* the current user of the application.
* the list of the user's contacts.

```swift
struct User: Equatable {
    let firstName: String
    let lastName: String
}

struct Contact: Equatable {
    let user: User
    let isConnected: Boolean
}

enum UserState: Equatable {
    case empty
    case loaded (User)
}

enum ContactsState: Equatable {
    case empty
    case loaded ([Contact])
}

struct AppState: State, Equatable {
    var userState: UserState
    var contactsState: ContactsState
}
```

As you can see, those types are "**value types**", it is a requirement to guarantee **State** immutability and consistency. They are also "**Equatable**". It will allow RxReduce to know if two successives **States** are the same or not, avoiding unnecessary notifications. That's an answer to one of our concerns 👍.

**AppState**&nbsp;also conforms to "**State**". It is a requirement to be handled by the **Store**.

The following "**dispatch()**" function belongs to the default&nbsp;**Store**&nbsp;provided by **RxReduce**:

```swift
public func dispatch (action: Action) {
    // every received action is converted to an async action
    action
        .toAsync()
        .map { [unowned self] (action) -> StateType? in
            return self.reducers.reduce(self.state.value, { (state, reducer) -> StateType? in
                return reducer(state, action)
            })
        }.subscribe(onNext: { [unowned self] (newState) in
            self.state.accept(newState)
        }).disposed(by: self.disposeBag)
}
```

Each time the **Store** receives an **Action**:

* the **Action** is transformed in an asynchronous one (see the "Conditional Conformance is magic" chapter).
* the list of the registered **Reducers** is applied to the **State**.
* the new **State** replaces the old one.

Let's see two examples of Actions:

```swift
struct LoadUserAction: Action {
    let firstname: String
    let lastname: String
}

struct LoadContactsAction: Action {
    let contacts: [Contact]
}
```

No rocket science here … **Actions** just embed what's needed to mutate the **State**, no business logic.

Here are two examples of **Reducers**:

```swift
func userReducer (state: AppState?, action: Action) -> AppState {

    var currentState = state ?? AppState(userState: UserState.empty,
                                         contactsState: ContactsState.empty)

    // according to the action we create a new state
    switch action {
    case let action as LoadUserAction:
        currentState.userState = UserState.loaded(User(firstname: action.firstname,
                                                       lastname: action.lastname))
        return currentState
    default:
        return currentState
    }
}

func contactsReducer (state: AppState?, action: Action) -> AppState {

    var currentState = state ?? AppState(userState: UserState.empty,
                                         contactsState: ContactsState.empty)

    // according to the action we create a new state
    switch action {
    case let action as LoadContactsAction:
        currentState.contactsState = ContactsState.loaded(action.contacts)
        return currentState
    default:
        return currentState
    }
}
```

Each **Reducer** handles the **Actions** it cares about. It allows to split the **State** mutations into logical units.

## Need to focus on your state ? Use Lenses !

**Lenses** is a technic from the functional programming that will address the remaining issue: "**what if I don't want to be notified by a State mutation that happens on a part I'm not interested in ?**"

A few resources about **Lenses**:

* [Lenses in Swift by Chris Eidhof](http://chris.eidhof.nl/post/lenses-in-swift/).
* [Lenses and Prisms in Swift by Elviro Rocca](https://broomburgo.github.io/fun-ios/post/lenses-and-prisms-in-swift-a-pragmatic-approach/).

In a few words, Lenses allow you to focus on a sub-part of a value type. Being a functional programming technic, it uses a function to do so. Let's try this on our model:

```swift
struct Lens<A,B> {
    let from : A -> B
}

let firstname = Lens<Contact, String>(from: { $0.user.firstname })

...

let myContact = Contact(user: User(firstname: "James", lastname: "Kirk"),
                        isConnected: true)

firstname.from(myContact) // will return "James"
```

RxReduce uses the very same technic to expose a **State** in a **Store**. You just have to call the "**state()**" function with the closure that focuses on the sub-State you want to listen to:

```swift
func state<SubState: Equatable>(from: (StateType) -> SubState) -> Driver<SubState> {
    return self.stateSubject
        .asDriver()
        .map { (state) -> SubStateType in
            return from(state)
        }.distinctUntilChanged()
}
```

This function addresses our two issues:

* it does not trigger a new event if two consecutives **States** are equal (thanks to "**distinctUntilChanged()**").
* it allows to not listen to the whole **State**.

Of course, you noticed the **State** is exposed via a **Driver** 😀👌 (remember: **State drives your UI**).

For the record, **RxReduce** also provides an implementation of this function without parameters, you will get a **Driver** for the whole **State**.

A typical workflow with RxReduce would look like that:

```swift
// init the Store with the list of the Reducers to apply
let store = Store<AppState>(withReducers: [userReducer, contactsReducer])

...

// listen for the UserState mutations
let userState: Driver<UserState> = store.state { (appState) -> UserState in
    return appState.userState
}

...

// react to the UserState mutations
userState.drive(onNext: { (userState) in
    print ("New userState is \(userState)")
    // update the UI in a Thread safe way
    ...
}).disposed(by: self.disposeBag)

...

// ask the Store to mutate the State
store.dispatch(action: LoadUserAction(firstname: "Tony", lastname: "Stark"))
```

## Conditional Conformance is magic

There is one concern left to address … side effects.

In functional programming, side effects are all the things that can mutate a **State** using I/O. It can be networking, persistence, file access, … Having side effects, a function can be unpredictable depending on the state of the system. When a function has no side effect, we can execute it anytime, it will always return the same result, given the same input.

In unidirectional data flow architectures, we will try to isolate side effects out of the golden path: **View -&gt; Action -&gt; Store -&gt; Reducer -&gt; State -&gt; View**.

Redux has a solution for that: **Action Creators**. It is something that will emit an **Action** and dispatch it to the **Store** once an asynchronous job is finished.

Hum, it looks familiar to me … wouldn't be exactly what an Observable&lt;**Action**&gt; is in RxSwift ? Does it mean that the **Store**'s "**dispatch()**" function should not take an **Action** as a parameter but an Observable&lt;**Action**&gt; ?

Well … yes and no ! In fact it can take both, because sometimes we want synchronous mutation and sometimes asynchronous mutation.

He who can most can least. A synchronous job is just an asynchronous job that ends at job start 👍. RxReduce provides a way to convert a synchronous action to an asynchronous one:

```swift
public protocol Action {
    func toAsync () -> Observable<Action>
}

extension Action {
    public func toAsync () -> Observable<Action> {
        return Observable<Action>.just(self)
    }
}
```

Very easy. If you remember the implementation of the "**dispatch()**" function, the first thing it does is calling "**action.toAsync()**" … now you have the explanation.

It's great but that's only one part of the solution, it allows the **Store** to dispatch synchronous actions as they were asynchronous. What about truly asynchronous actions ?

Lately, Swift 4.1 has introduced conditional conformance. If you are not familiar with this concept: [A Glance at conditional conformance](/posts/2018-04-02-GlanceAtConditionalConformance).

Basically it allows to make a generic type conform to a protocol only if the associated inner type also conforms to this protocol. Let's apply this to Observable:

```swift
extension Observable: Action where Element == Action {
    public func toAsync () -> Observable<Action> {
        return self.map { $0 as Action }
    }
}
```

It means that an Observable&lt;**Action**&gt; is also in **Action**, only if the Element is itself an **Action**. Pretty neat.

The Store will dispatch an **Action** whether it is synchronous or asynchronous … seamlessly.

In fact, loading a User would look like that:

```swift
let loadUserAction: Observable<Action> = UserApi.fetchUser(id: 1).map { user in
    return LoadUserAction(user: user)
}

store.dispatch(action: loadUserAction)
```

Conditional Conformance is a very powerful feature, and no need for Action Creators at all 😀.

## Demo application

You will find a complete [Demo application](https://github.com/RxSwiftCommunity/RxReduce/tree/master/RxReduceDemo) in the RxReduce repo. It uses a combination of MVVM and State Container.

## Conclusion

I think **State Container Architectures** are a great contribution to the mobile software engineering. It forces to ask yourself what should be the **State** of your application, how to mutate it, how to isolate the I/Os. It is a truly good complement to traditional patterns that are only view oriented.

RxReduce leverages functional reactive programming to address issues that could repel you otherwise.

If you'd like to know more about RxReduce, feel free to visit the [GitHub repo](https://github.com/RxSwiftCommunity/RxReduce) and contribute 👍.

I hope you enjoyed this topic.

Stay tuned.
