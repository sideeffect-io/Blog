---
title: Functions as dependencies in Swift
date: 2020-08-19
description: Implementing an architecture within an application can be challenging. There are rules we can follow (SOLID, Clean Architecture) and patterns to guide us (MVVM, MVP, MVI, Redux, …) but sometimes, things we thought were well established deserve a step back.
tags: architecture, functional programming
image: images/2020-08-19-FunctionsAsDependencies/header.png
---

# Introduction
Implementing an architecture within an application can be challenging. There are rules we can follow (SOLID, Clean Architecture) and patterns to guide us (MVVM, MVP, MVI, Redux, …) but sometimes, things we thought were well established deserve a step back.

Lately, I’ve been in this situation while developing an application that relied on the use of [higher order free functions](https://en.wikipedia.org/wiki/Higher-order_function).
In this article, I’ll try to guide you from the sparkle that lit this desire for higher order free functions to its implementation regarding dependency injection.

# Dependency Injection

Dependency injection is a technique at the crossroads of well known software engineering best practices: abstraction and decoupling, single responsibility, dependency inversion. It provides flexible and testable implementations.
This article assumes that the merits of dependency injection are accepted. We will see how dependency injection and higher order functions fit very well together.

# Implementation in a traditional way

In the rest of this article we will focus on a UsersRepository object that fetches users from a Rest API and filters them out before returning them. For the sake of the demonstration all the endpoints of this API return users but with different flavours depending on the fetched route.

To do so the UsersRepository will be injected with an ApiService protocol whose purpose is to provide a way to fetch users from the Rest endpoints:

```swift
protocol ApiService {
    func fetch(route: Route) -> AnyPublisher<[User], ApiError>
}

class UsersRepository {
    private let apiService: ApiService

    init(apiService: ApiService) {
        self.apiService = apiService
    }

    func loadAllUsers() -> AnyPublisher<[User], Error> {
        let allUsersRoute = Route("/api/users/all")
        self
            .apiService
            .fetch(route: allUsersRoute)
            .map { $0.filter { $0.isActive } }
            .mapError { _ in UsersRepositoryError.someError }
            .eraseToAnyPublisher()
    }
}
```

This is a pretty common implementation. Of course, in real life implementation, we would try to make the ApiService more versatile and safe by using generic types and constraints.

As I said in the introduction, let’s give it a second thought … why an ApiService ?

In fact, we just want to retrieve users, the repository doesn’t care about where they come from, it is an implementation detail. A Rest API is one way among many.

A trivial approach would be to refactor the ApiService into a more versatile DataProvider protocol.

But what about its definition?

* the “fetch” function doesn’t really make sense anymore
* the “route” parameter becomes irrelevant outside an API context
* the “ApiError” type is too specific

Of course, we could find a way to pick more « any purpose » names and data structures but I invite you to look for another way.

# Injecting functions

After all, the UsersRepository only relies on an AnyPublisher&lt;[User], ApiError&gt; to perform its work, right ?

The temptation is strong to directly inject this publisher as a dependency, but we should not. Injecting it directly would mean to build this publisher pretty early in the injection process and this is something that might lead to unwanted side effects: perhaps it takes time to be built or it needs other dependencies to be resolved ? The UsersRepository doesn’t know that and can make no assumption on that. The publisher should only be built if and when needed.

If we can’t inject the publisher, we can inject a function that builds it 👍, and execute it at our convenience.

Let’s give it a try then.

```swift
class UsersRepository {
    typealias RetrieveUsersFunction = () -> AnyPublisher<[User], Error>
    private let retrieveUsersFunction: RetrieveUsersFunction

    init(retrieveUsersFunction: @escaping RetrieveUsersFunction) {
        self.retrieveUsersFunction = retrieveUsersFunction
    }

    func loadUsers() -> AnyPublisher<[User], Error> {
        self.retrieveUsersFunction()
            .map { $0.filter { $0.isActive } }
            .mapError { _ in UsersRepositoryError.someError }
            .eraseToAnyPublisher()
    }
}
```

What have we done here:

* To ease the reading, we’ve declared a typealias describing the function signature
* We’ve injected the function
* We’ve used the function as a replacement of the ApiService
* The publisher signature has changed a bit, from AnyPublisher&lt;[User], ApiError&gt; to AnyPublisher&lt;[User], Error&gt;. We do not want to leak implementation details here because of the error type.

So far so good … but what about the Route we used to pass to the fetch function ? In fact we don’t need it anymore as it was specific to the ApiService; nevertheless, we will cover this precise point later in this article.

As a bonus we can also inject the filtering function so we can change its behaviour depending on the context (the filter might differ between dev, QA or prod environment for instance).

```swift
class UsersRepository {
    typealias RetrieveUsersFunction = () -> AnyPublisher<[User], Error>
    typealias FilterUserFunction = (User) -> Bool

    private let retrieveUsersFunction: RetrieveUsersFunction
    private let filterUserFunction: FilterUserFunction

    init(retrieveUsersFunction: @escaping RetrieveUsersFunction,
         filterUserFunction: @escaping FilterUserFunction) {
        self.retrieveUsersFunction = retrieveUsersFunction
        self.filterUserFunction = filterUserFunction
    }

    func loadUsers() -> AnyPublisher<[User], Error> {
        self.retrieveUsersFunction()
            .map { [filterUserFunction] in $0.filter(filterUserFunction) }
            .mapError { _ in UsersRepositoryError.someError }
            .eraseToAnyPublisher()
    }
}
```

Once again we take advantage of typealiases to pass the functions around. This becomes almost mandatory when using functions as dependencies.

While we are at it, perhaps we can push our reflexion a bit further and take a final step towards the systematic use of functions.

Why do we need a repository ? Usually, the repository pattern is used to group all the CRUD operations about an entity. We can assume that a UsersRepository will have several load, update, and delete functions. Once implemented, those functions will require a certain number of dependencies. We will end up with an initializer taking all the needed functions as parameters, whereas we might only need some of them depending on the feature we want to accomplish. This is not optimal.

Getting rid of the repository implies that every function (load, update, delete …) is self-supporting and is being injected only with the needed dependencies.

```swift
typealias RetrieveUsersFunction = () -> AnyPublisher<[User], Swift.Error>
typealias FilterUserFunction = (User) -> Bool

static func loadUsers(
    retrieveUsersFunction: RetrieveUsersFunction,
    filterUserFunction: @escaping FilterUserFunction
) -> AnyPublisher<[User], Error> {
    retrieveUsersFunction()
        .map { $0.filter(filterUserFunction) }
        .mapError { _ in UsersError.someError }
        .eraseToAnyPublisher()
}
```

Here we go, we have a 100% autonomous function. For the sake of clarity we can wrap the whole thing inside a namespace to shorten some names:

```swift
enum Users {
    enum Error: Swift.Error {
        case someError
    }

    typealias RetrieveFunction = () -> AnyPublisher<[User], Swift.Error>
    typealias FilterFunction = (User) -> Bool

    static func load(
        retrieveFunction: RetrieveFunction,
        filterFunction: @escaping FilterFunction = { $0.isActive }
    ) -> AnyPublisher<[User], Error> {
        retrieveFunction()
            .map { $0.filter(filterFunction) }
            .mapError { _ in Users.Error.someError }
            .eraseToAnyPublisher()
    }
}
```

> We can also have a default value for the filterFunction parameter to make a more concise API

# The positive impact on the unit tests

Let’s get back to the original UsersRepository implementation. In order to unit test the loadUsers function, we would have had to create a mocked ApiService to fulfill the initializer requirements. The mocked ApiService should be able to succeed or fail in order to test the output of the loadUsers function.

In the unfortunate case where the ApiService also needs a dependency on its own, then we would have been forced to implement another mocked dependency as well. If we apply that strategy to the whole application, we might end up with a complex hierarchy of mock objects.

When using functions as dependencies, we still need mocks of course, but they are in general very small, simple and defined right next to the unit test:

```swift
func test_loadUsers_return_users_when_dependencies_succeed() {
    // Given: a retrieve function that succeeds at getting some Users
    let successRetrieveFunction = {
        Just<[User]>([User(isActive: true), User(isActive: false)])
            .setFailureType(to: Swift.Error.self)
            .eraseToAnyPublisher()
    }

    let mockFilterFunction = { (user: User) -> Bool in return true }

    // When: loading the users
    let users = Users.load(retrieveFunction: successRetrieveFunction,
                           filterFunction: mockFilterFunction)

    // Then: we can make assertions about the retrieved users
    // XCTAssert(...)
}

func test_loadUsers_return_error_when_dependencies_fail() {
    // Given: a retrieve function that fails at getting some Users
    let failureRetrieveFunction = {
        Fail<[User], Swift.Error>(error: NSError(domain: "domain.mock",
                                                 code: -1))
            .eraseToAnyPublisher()
    }

    let mockFilterFunction = { (user: User) -> Bool in return true }

    // When: loading the users
    let users = Users.load(retrieveFunction: failureRetrieveFunction,
                           filterFunction: mockFilterFunction)

    // Then: we can make assertions about the received error
    // XCTAssert(...)
}
```

Unit tests are super easy to imagine, to write, and to read. Personally, I find this technique a very good tool to reach a high (and meaningful) code coverage. I think it can help a lot when using a TDD approach.

# A trick from functional programming

Do you remember the original implementation of the UsersRepository: it used an ApiService to fetch an endpoint defined by a route. Even though this has been erased by the abstraction brought by the injection of functions, at the end we still need to provide a function that can retrieve users for real. It is up to the dependency injection mechanism to provide a compatible concrete implementation.

We have an ApiService at our disposal but the fetch definition does not match the signature we need:

```swift
(Route) -> AnyPublisher<[User], ApiError>

                VS

() -> AnyPublisher<[User], Swift.Error>
```

We need to perform two changes here:

* Erase the Route parameter
* Change the error type

To erase the Route parameter we can borrow some techniques from the functional programming like partial functions or currying.
We will go with partial functions here, even though currying could be a reasonable choice as well.

Partializing a function is like saying to the compiler « Hey, I know some parameters of this function, I can set them right now, but the rest of the parameters are still undefined, please give me back a function that will only take those parameters so I can call it later!»

Let’s take a look at an example 😏.

dumbFunction is a function that takes two parameters and returns a Bool.

```swift
func dumbFunction(param1: String, param2: Int) -> Bool {
    // Does some smart calculations and returns a Bool
}
```

We can partialize that function to be able to « freeze » the first parameter and get back in return a function that only takes the second one.

```swift
func partializedDumbFunction(param1: String) -> (Int) -> Bool {
    return { (unknownParam2: Int) -> Bool in
        return dumbFunction(param1: param1, param2: unknownParam2)
    }
}
```

Now, instead of using the function ‘dumbFunction’ with 2 parameters, we can use its partialized counterpart with only one parameter

```swift
let dumbFunctionWithOneFixedParameter = partializedDumbFunction("Param1")
let dumbFunctionWithOne = dumbFunctionWithOneFixedParameter(1)
let dumbFunctionWithTwo = dumbFunctionWithOneFixedParameter(2)
```

It is a little bit like if we had performed dependency injection of the first parameter, the partialization has « captured » it.

Of course, we cannot write a partialized version of every function in our code base. There is a way to make it generic with any numbers of parameters.

```swift
func partial<Arg1, Result>(
    _ function: @escaping (Arg1) -> Result,
    arg1: Arg1
) -> () -> Result {
    return {
        function(arg1)
    }
}

func partial<Arg1, Arg2, Result>(
    _ function: @escaping (Arg1, Arg2) -> Result,
    arg1: Arg1
) -> (Arg2) -> Result {
    return { (unkownArg2: Arg2) in
        function(arg1, unkownArg2)
    }
}

func partial<Arg1, Arg2, Result>(
    _ function: @escaping (Arg1, Arg2) -> Result,
    arg2: Arg2
) -> (Arg1) -> Result {
    return { (unkownArg1: Arg1) in
        function(unkownArg1, arg2)
    }
}
```

And we can write as much versions of partial functions as needed.

Do you see where I’m going here ? We went from a function with two parameters to a function with only one. Then, we can go from a function with one parameter to a function with none !

Let’s get back to the *ApiService.fetch* function and apply a partialization on it:

```swift
let apiService = MyApiService()
let usersRoute = Route("/api/users/all")
let partializedFetchFunction = partial(apiService.fetch, arg1: usersRoute)
```

We now have a partialized function with the signature:

**() -> AnyPublisher&lt;[User], ApiError&gt;**, the route parameter has been captured by the partialization and will be used when executing **partializedFetchFunction**.

We’re almost there, all we need to do is hide the ApiError, fortunately Combine can help use with that:

```swift
...
let retrieveUsersFunction: Users.RetrieveFunction = {
    return partializedFetchFunction()
        .mapError { $0 as Swift.Error }
        .eraseToAnyPublisher()
}
```

Aaaaaand we have our dependency ! the retrieveUsersFunction has that signature:
**() -> AnyPublisher&lt;[User], Swift.Error&lg;**

We can inject it in the Users.load function 👌.

# Sum up

## 1: use function as dependencies:

```swift
enum Users {
    enum Error: Swift.Error {
        case someError
    }

    typealias RetrieveFunction = () -> AnyPublisher<[User], Swift.Error>
    typealias FilterFunction = (User) -> Bool

    static func load(
        retrieveFunction: RetrieveFunction,
        filterFunction: @escaping FilterFunction = { $0.isActive }
    ) -> AnyPublisher<[User], Error> {
        retrieveFunction()
            .map { $0.filter(filterFunction) }
            .mapError { _ in Users.Error.someError }
            .eraseToAnyPublisher()
    }
}
```

## 2: use partialization to build the dependencies:

```swift
...
let retrieveUsersFunction: Users.RetrieveFunction = {
    return partializedFetchFunction()
        .mapError { $0 as Swift.Error }
        .eraseToAnyPublisher()
}
```

## 3: inject the dependency

```swift
let users = Users.load(retrieveFunction: retrieveUsersFunction,
filterFunction: { $0.isActive })
```

The most delicate part is the second one as it asks some plumbing and boilerplate, but it should be segregated in specific areas of your code dedicated to dependency injection, like Swinject Assemblies for instance.

# Conclusion

Although injecting traditional data structures is perfectly fine and is in line with best practices, injecting functions offers two major benefits:

* This puts under a new light how easy it is to leak the implementation details and how we can avoid it. The less we know about our dependencies, the better. I guess this illustrates perfectly the [Law of Demeter](https://en.wikipedia.org/wiki/Law_of_Demeter)
* This makes unit tests easier to write, to read, and to reason about

Using functions « everywhere » can have some unpleasant aspects like making signatures hard to read for instance. But this is something we can easily work around by using typealiases.

Using functions « everywhere » also opens the door to functional programming. We had a taste of it with partialization but it is a whole new world that you should gently explore.

Thanks for reading.

Stay tuned.

# Bonus: Swinject and the injection of functions

Swinject is a well established dependency injection framework in the Swift community. It is used to register and resolve the « recipes » to build your dependencies. But what about registering and resolving functions ?

There is nothing more like a **(String) -> String** function than another **(String) -> String** function, right !

What happens if we need to resolve a function that has been registered several time with the same signature ?

Swinject provides a way to discriminate registered services by using a unique name. If we want to use that in our **(String) -> String** case, we will end up with something like this:

```swift
class MyAssembly: Assembly {
    func register(container: Container) {
        container.register(((String) -> String).self,
                           name: "StringFunction1") { _ in
                            return { param in
                                return param + "JAMES"
                            }
        }

        container.register(((String) -> String).self,
                           name: "StringFunction2") { _ in
                            return { param in
                                return param + "LEONARD"
                            }
        }
    }
}
```

When it comes to resolve things:

```swift
let stringFunction1 = resolver.resolve(((String) -> String).self,
name: "StringFunction1")
```

While there is nothing wrong about that, this is kind of ugly to read. We can improve this a bit with a protocol that groups the function signature and its name:

```swift
public protocol NamedService {
    associatedtype Service
    static var type: Service.Type { get }
    static var name: String { get }
}

public extension NamedService {
    static var type: Service.Type {
        Service.self
    }

    static var name: String {
        "\(self)"
    }
}

// And then we can extend Swinject

public extension Container {
    @discardableResult
    func register<Service>(
        namedServiceType: Service.Type,
        factory: @escaping (Resolver) -> Service.Service
    ) -> ServiceEntry<Service.Service> where Service: NamedService {
        self.register(namedServiceType.type,
                      name: namedServiceType.name,
                      factory: factory)
    }
}

public extension Resolver {
    func resolve<Service>(
        namedServiceType: Service.Type
    ) -> Service.Service? where Service: NamedService {
        self.resolve(namedServiceType.type,
                     name: namedServiceType.name)
    }
}
```

With that in place, the Swinject assembly now becomes:

```swift
class MyAssembly: Assembly {

    enum StringFunction1: NamedService {
        typealias Service = (String) -> String
    }

    enum StringFunction2: NamedService {
        typealias Service = (String) -> String
    }

    func register(container: Container) {
        container.register(namedService: StringFunction1.self) { _ in
            return { param in
                return param + "JAMES"
            }
        }

        container.register(namedService: StringFunction2.self) { _ in
            return { param in
                return param + "LEONARD"
            }
        }
    }
}
```

When it comes to resolve things:

```swift
let stringFunction1 = resolver.resolve(namedService: StringFunction1.self)
```

Even if we do not win that much in doing this, we make the function registration/resolving look like any traditional data structure usage. It removes a pain point in injecting functions that could have prevented you from trying this technique 😏.
