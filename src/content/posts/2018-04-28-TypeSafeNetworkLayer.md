---
title: Type safe network layer
date: 2018-04-28
description: There are plenty of posts about doing a network layer in a type safe way with Swift. No matter the used network API, those approaches all rely on returning a data type that is precisely what we expect. In this post we will try to go a little bit further by strongly coupling the endpoint we want to fetch and the data type we are expecting.
tags: architecture
image: images/2018-04-28-TypeSafeNetworkLayer/network_layer.png
---

# A quick reminder

Let's say we want to fetch one of the "**dog.ceo**" endpoints. It usually begins with defining the routes. Enums are great for that:

```swift
enum Routes: String {
    case allBreeds = "breeds/list/all"
    case beagles = "beagle/images"
}
```

As the purpose of the post is not to implement a fully functional network layer, we won't consider the different kinds of HTTP methods or Headers / Parameters customization here. A "String Enum" is a satisfying solution in our case.

We then define a model that fits with the ".**allBreeds**" endpoint JSON response. Of course we will use **Codable** to ease its deserialization.

```swift
struct Breeds: Codable {
    let status: String
    let message: [String: [String]]
}
```

Here is the model that represents the "**.beagles**" endpoint:

```swift
struct Beagles: Codable {
    let status: String
    let message: [String]
}
```

We can also define a "**Result**" type that will wrap the data returned by the endpoint. As this can fail, the "**Result**" type will be an enum that can be either a success or a failure:

```swift
enum Result<Model> {
    case success(Model)
    case failure(Error)
}
```

We can now dive into the fetching mechanism itself. For the sake of simplicity, we will use Alamofire to fetch the request, but a simple UrlSession would also do the job.

```swift
final class NetworkService {
    let baseURL: String

    init(withBaseURL baseURL: String) {
        self.baseURL = baseURL
    }

    func fetch<Model: Codable> (fromRoute route: Routes,
                                then: @escaping (Result<Model>) -> Void) {

        // make sure the endpoint path is a valid URL
        guard let url = URL(string: self.baseURL+route.rawValue) else {
            then(.failure(NSError(domain: "warpfactor.io", code: 500)))
            return
        }

        Alamofire
            .request(url)
            .responseData { (response) in
                guard response.error == nil else {
                    then(.failure(response.error!))
                    return
                }

                if  let data = response.data,
                    let model = try? JSONDecoder().decode(Model.self, from: data) {
                    then(.success(model))
                } else {
                    then(.failure(NSError(  domain: "warpfactor.io",
                                            code: 1000,
                                            userInfo: ["error":"wrong model"])))
                }
        }
    }
}
```

The type safety is assured by the combination of 2 Swift features:

* generic function: the "**fetch&lt;Model: Codable&gt;**" syntax let the compiler know that in the "**Result&lt;Model&gt;**" statement, the "**Model**" will be a subtype of "**Codable**". It assures us that once the model is unwrapped from the "**Result.success**" value it will be of the type we want.&nbsp;
* type inference: the "**fetch&lt;Model: Codable&gt;**" syntax also allows to be able to instantiate the "**Model**" as we know it has a "**Codable**" initializer for sure. This is what makes this statement "**let model = try? JSONDecoder().decode(Model.self, from: data)**" possible.

The usage of such a network layer is pretty easy and straight forward:

```swift
let networkService = NetworkService(withBaseURL: "https://dog.ceo/api/")

networkService.fetch(fromRoute: Routes.allBreeds) { (result: Result<Breeds>) in
    switch result {
    case .success(let model):
        print (model)
    case .failure(let error):
        print (error)
    }
}
```

We can clearly see the type inference in action as we explicitly tell the compiler that we expect a "**Model**" to be a "**Breeds**" in the closure parameter.

What we achieved here is indeed type safe, in the meaning that if the request succeeds on the "**.allBreeds**" endpoint, we will be given a "**Breeds**" typed response for sure.

What happens if, while still fetching the "**.allBreeds**" endpoint, we modify the result type to be a "**Result&lt;Beagles&gt;**" ?&nbsp;

# Not that safe !

From the compiler perspective: nothing happens. It is perfectly OK, because "**Beagles**" respects the only condition the fetch function requires: to be a Codable.

It means that there is no correlation between the endpoint and its result !

The following code will compile, but will crash at runtime:&nbsp;

```swift
networkService.fetch(fromRoute: Routes.allBreeds) { (result: Result<Beagles>) in
    switch result {
    case .success(let model):
        print (model)
    case .failure(let error):
        print (error)
    }
}
```

Swift is a language that promotes a "compile time" safety, so there has to be a way to ensure the consistency between the endpoints and their return types.

# Make it safer for your team

Introducing a lack of type safety in your application is an open gate for errors and bugs that your teammates will surely introduce, not by their fault but by yours. As an application architect or an API designer you have to provide a safe pattern for your team.

Lets improve the situation in a few steps.

## Step 1: Generic endpoints

The source of our issue is the lack of coupling between the endpoint and the model it is supposed to return. It is easy to address with a generic struct:

```swift
struct Route<Model> {
    let endpoint: String
}

struct Routes {
    static let allBreeds = Route<Breeds>(endpoint: "breeds/list/all")
    static let beagles = Route<Beagles>(endpoint: "breed/beagle/images")
}
```

Routes are not enums anymore, they are structs that are typed by a Model. It means that when I want to declare a new Route, I also have to be precise on the type of model it will return. We have our coupling !

## Step 2: Adapt the network layer

We have to slightly modify the fetch function because the generic type is no more attached to the model directly but to the model of the **Route**.

so we're going from:

```swift
func fetch<Model: Codable> (fromRoute route: Routes,
                            then: @escaping (Result<Model>) -> Void) {
```

to

```swift
func fetch<Model: Codable> (fromRoute route: Route<Model>,
                            then: @escaping (Result<Model>) -> Void) {
```

## Step 3: Just use it

By just coupling the endpoint with the model, the Swift compiler knows what it should give you back in the closure parameter. As we can see here, there is no more a need to explicitly specify the type of "**result**", it will be for sure "**Breeds**", because the endpoint "**.allBreeds**" is related to that type by definition.

```swift
networkService.fetch(fromRoute: Routes.allBreeds) { (result) in
    switch result {
    case .success(let model):
        print (model)
    case .failure(let error):
        print (error)
    }
}
```

As a proof, we can display the information about the unwrapped "model" from the result, the compiler knows it is a "**Breeds**" 👍

![](/images/2018-04-28-TypeSafeNetworkLayer/network1.png)​​​​​​

Let's try to misuse the mechanism: while still using the same endpoint we try to explicitly tell the compiler that the result is a "**Result&lt;Beagles&gt;**".

![](/images/2018-04-28-TypeSafeNetworkLayer/network2.png)

As expected, it fails 👌. We truly have a compile time type safe network layer 😏, with minor changes to our API. Very cool.

Thanks for reading !

Stay tuned.
