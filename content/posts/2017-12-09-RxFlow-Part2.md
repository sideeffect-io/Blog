---
title: RxFlow Part 2 - In Practice
date: 2017-12-09
description: A few weeks ago I introduced in this blog an iOS framework called RxFlow. I’ve been working on this framework for several months, and it is now ready to be used. If you haven’t read it yet, I suggest you take a look at this post "RxFlow Part1 - In Theory".
tags: open source, reactive programming
image: images/2017-12-09-RxFlow-Part2/RxFlow_Logo.png
---

A few weeks ago I introduced in this blog an iOS framework called RxFlow. I’ve been working on this framework for several months, and it is now ready to be used. If you haven’t read it yet, I suggest you take a look at this [post](/posts/2017-11-08-RxFlow-Part1/).

To sum up, RxFlow aims to:

* ease the cutting of your navigation into logical sections
* remove the navigation code from the View Controllers
* encourage the reusability of the View Controllers
* promote reactive programming
* promote dependency injection

A quick reminder of the terminology:

* Flow: each Flow defines a navigation area within your application.
* Step: each Step is a navigation state in your application. Combinaisons of Flows and Steps describe all the possible navigation actions.
* Stepper: it can be anything that can emit Steps. Steppers will be responsible for triggering every navigation actions within the Flows
* Presentable: it is an abstraction of something that can be presented, basically UIViewController and Flow are Presentable
* NextFlowItem: it tells the Coordinator what will be the next thing that will produce new Steps in its Reactive mechanism
* Coordinator: the job of the Coordinator is to mix combinaisons of Flows and Steps in a consistent way

It is also important to keep in mind that RxFlow uses protocol oriented programming so that it doesn’t freeze your code in an inheritance hierarchy.

In the [RxFlow repo](https://github.com/RxSwiftCommunity/RxFlow) you will find a demo application. It shows pretty much every possible navigation types:

* Navigation stack
* Tab bar
* Master / detail
* Modal popup

![](/images/2017-12-09-RxFlow-Part2/demo_rxflow.gif)

# It’s all about States

RxFlow is mainly about handling navigation state changes in a reactive way. In order to be reused in multiple contexts, these states must be unaware of the current navigation Flow the user is in. Therefore, instead of meaning “I want to go to this screen”, a state will rather mean “Someone or something has done this action” and RxFlow will pick the right screen according to the current navigation Flow. With RxFlow, this navigation states are called Steps.

Enums are a great way to describe Steps:

* they are easy to use
* a value can be defined only one time (therefore a state is unique)
* they are safe to use as Swift wants you to implement all their possible values in switch statements
* they can embed values that will be given from one screen to another
* they are value types, so there is no shared reference with uncontrolled propagation

For instance, in the demo application, those are all the Steps that we need to cover the navigations possibilities.

```swift
import RxFlow

enum DemoStep: Step {
    case apiKey
    case apiKeyIsComplete

    case movieList

    case moviePicked (withMovieId: Int)
    case castPicked (withCastId: Int)

    case settings
    case settingsDone
    case about
}
```

# Go with the Flow
With RxFlow, all the navigation code, such as presenting or pushing view controllers, is declared in Flows. A Flow represents a logical navigation section in your application, and when combined to a specific Step, it triggers some navigation actions.

To do so, a Flow has to implement:

* a “navigate(to:)” function that makes the navigation actions happen according the Flow and the Step
* a “root” UIViewController on which will be based the navigation in this Flow

Here is a Flow example that handles a UINavigationController and its navigation stack. In this Flow, three navigation actions are possible.

```swift
import RxFlow
import UIKit

class WatchedFlow: Flow {

    var root: UIViewController {
        return self.rootViewController
    }

    private let rootViewController = UINavigationController()
    private let service: MoviesService

    init(withService service: MoviesService) {
        self.service = service
    }

    func navigate(to step: Step) -> [NextFlowItem] {
        guard let step = step as? DemoStep else {
            return NextFlowItem.noNavigation
        }

        switch step {

        case .movieList:
            return navigateToMovieListScreen()
        case .moviePicked(let movieId):
            return navigateToMovieDetailScreen(with: movieId)
        case .castPicked(let castId):
            return navigateToCastDetailScreen(with: castId)
        default:
            return NextFlowItem.noNavigation
        }
    }

    private func navigateToMovieListScreen () -> [NextFlowItem] {
        let viewModel = WatchedViewModel(with: self.service)
        let viewController = WatchedViewController.instantiate(with: viewModel)
        viewController.title = "Watched"
        self.rootViewController.pushViewController(viewController, animated: true)
        return [NextFlowItem(nextPresentable: viewController, nextStepper: viewModel)]
    }

    private func navigateToMovieDetailScreen (with movieId: Int) -> [NextFlowItem] {
        let viewModel = MovieDetailViewModel(withService: self.service, andMovieId: movieId)
        let viewController = MovieDetailViewController.instantiate(with: viewModel)
        viewController.title = viewModel.title
        self.rootViewController.pushViewController(viewController, animated: true)
        return [NextFlowItem(nextPresentable: viewController, nextStepper: viewModel)]
    }

    private func navigateToCastDetailScreen (with castId: Int) -> [NextFlowItem] {
        let viewModel = CastDetailViewModel(withService: self.service, andCastId: castId)
        let viewController = CastDetailViewController.instantiate(with: viewModel)
        viewController.title = viewModel.name
        self.rootViewController.pushViewController(viewController, animated: true)
        return NextFlowItem.noNavigation
    }
}
```


# Navigation is a side effect

When we learn Functional Reactive Programming, we often read about side effects. The aim of FRP is to propagate events and apply them functions all along the way. These functions may transform those events and eventually (but not necessarily) execute code that will perform whatever feature you want (do some networking, save a file, display an alert, …): those are side effects.

Because RxFlow relies on Reactive Programming, we can easily identify the inherent notions:

* events: those are the emitted Steps
* function: this is the “navigate(to:)” function
* transformation: the “navigate(to:)” function transforms a ** Step** into NextFlowItem
* side effects:  those are the navigation actions performed in “navigate(to:)” (for instance, the function “navigateToMovieListScreen()” pushes a new UIViewController on the navigation stack)

# Navigating consists in making NextFlowItems

Basically, a NextFlowItem is a simple data structure that holds a Presentable and a Stepper.

A Presentable tells the Coordinator what will be the next thing you will present, and a Stepper tells the Coordinator what will be the next thing to emit Steps.

By default, all kinds of UIViewControllers are Presentable. Flows are also Presentable because at some point you will want to launch a whole new navigation area described in its own Flow, so RxFlow consider it as something that can be presented.

Why should the Coordinator know about Presentables ?

Presentable is an abstraction of something that can be presented. Because a Step cannot be emitted unless its associated Presentable is displayed, Presentable offers Reactive observables that the Coordinator will subscribe to (so it will be aware of the presentation state of the Presentable). Therefore there is no risk of firing a Step while its Presentable is not yet fully displayed.

A Stepper can be anything: a custom UIViewController, a ViewModel, a Presenter… Once it is registered in the Coordinator, a Stepper can emits Steps via its “step” property (which is a RxSwift subject). The Coordinator will listen for these Steps and call the Flow’s “navigate(to:)” function.

Here is an exemple of Stepper in the demo app.

```swift
import RxFlow
import RxSwift

class WatchedViewModel: Stepper {

    let movies: [MovieViewModel]

    init(with service: MoviesService) {
        // we can do some data refactoring in order to display
        // things exactly the way we want (this is the aim of a ViewModel)
        self.movies = service.watchedMovies().map({ (movie) -> MovieViewModel in
            return MovieViewModel(id: movie.id,
                                  title: movie.title,
                                  image: movie.image)
        })
    }

    public func pick (movieId: Int) {
        self.step.onNext(DemoStep.moviePicked(withMovieId: movieId))
    }
}
```

In this example, the pick function is called when the user picks a movie in a list. This function emits a new value in the “self.step” Rx stream.

To sum up the navigation process :

* the navigate(to:) function is called with a Step as a parameter
* according to this Step, some navigation code is called (side effects)
* also according to this Step, NextFlowItems are produced. Therefore, Presentables and Steppers are registered into the Coordinator
* Steppers emit new Steps and here we go again

# Why is it OK to produce multiple NextFlowItems for a single combination of Flow and Step ?

Because nothing forbids an application to have several navigations at a time. For instance each item of a tab bar can lead to a navigation stack. The Step that triggers the display of the UITabbarController will result in a NextFlowItem per navigation stack.

You can have a look at the demo app to understand the concept. Here is an extract where we wire a UITabBarController with 2 Flows (each Flow describes the navigation stack associated with a tab bar item):

```swift
private func navigationToDashboardScreen () -> [NextFlowItem] {
    let tabbarController = UITabBarController()
    let wishlistStepper = WishlistStepper()
    let wishListFlow = WishlistWarp(withService: self.service,
                                    andStepper: wishlistStepper)
    let watchedFlow = WatchedFlow(withService: self.service)

    Flows.whenReady(flow1: wishListFlow, flow2: watchedFlow, block: { [unowned self]
    (root1: UINavigationController, root2: UINavigationController) in
        let tabBarItem1 = UITabBarItem(title: "Wishlist",
                                       image: UIImage(named: "wishlist"),
                                       selectedImage: nil)
        let tabBarItem2 = UITabBarItem(title: "Watched",
                                       image: UIImage(named: "watched"),
                                       selectedImage: nil)
        root1.tabBarItem = tabBarItem1
        root1.title = "Wishlist"
        root2.tabBarItem = tabBarItem2
        root2.title = "Watched"

        tabbarController.setViewControllers([root1, root2], animated: false)
        self.rootViewController.pushViewController(tabbarController, animated: true)
    })

    return ([NextFlowItem(nextPresentable: wishListFlow,
                      nextStepper: wishlistStepper),
             NextFlowItem(nextPresentable: watchedFlow,
                      nextStepper: OneStepper(withSingleStep: DemoStep.movieList))])
}
```

The static function “Flows.whenReady()” takes the Flows to launch and a closure that will be called when these Flows are ready to be displayed (ie when the first screen of this Flow has been picked).

# Why is it OK to produce no NextFlowItem at all for a combination of Flow and Step ?

Because a navigation Flow has to have an end ! For instance the last screen of a navigation stack will not allow further navigation but only a back action handled by the UINavigationController itself.  In this case, the navigate(to:) function will return NextFlowItem.noNavigation.

# What happens in a Flow … stays in a Flow !

As we’ve already seen, it is possible to have multiple Flows being navigated at the same time. For instance, a screen in a navigation stack could launch a popup which could also contain another navigation stack. From a UIKit point of view, the UIViewController hierarchy is very important, and we cannot mess up with that inside the Coordinator.

This is why when a Flow is not currently displayed (in our example, it is when the first navigation stack is under the popup), the Steps that could be emitted within it will be ignored by the Coordinator.

In a more general point of view, the Steps emitted in the context of a Flow will be interpreted only in the context of that Flow(they cannot be caught by other ones).

# Dependency Injection made easy

DI is one of the main goal of RxFlow. Basically, dependency injection can be done by passing an implementation of something (a service, a manager, …) as a parameter to an initializer or a method (it can also be done via property).

In a RxFlow, as the developer takes care of instantiating UIViewControllers, ViewModels, Presenters, and so on, it is a great opportunity to inject whatever you need. Here is an example of dependency injection in a ViewModel.

```swift
import RxFlow
import UIKit

class WatchedFlow: Flow {

    ...
    private let service: MoviesService

    init(withService service: MoviesService) {
        self.service = service
    }
    ...
    private func navigateToMovieListScreen () -> [NextFlowItem] {
        // inject Service into ViewModel
        let viewModel = WatchedViewModel(with: self.service)

        // injecy ViewMNodel into UIViewController
        let viewController = WatchedViewController.instantiate(with: viewModel)

        viewController.title = "Watched"
        self.rootViewController.pushViewController(viewController, animated: true)
        return [NextFlowItem(nextPresentable: viewController, nextStepper: viewModel)]
    }
    ...
}
```

# How to bootstrap a navigation process
Now that you know how to wire things together, to mix Flows and Steps to trigger navigation actions and to produce NextFlowItems, there is one thing left to do: bootstrap the navigation process when the application starts.

Everything happens in the AppDelegate, and you’ll see that this is pretty straightforward:

* instantiate the Coordinator
* instantiate the first Flow to be navigated
* ask the Coordinator to coordinate this Flow with a first Step
* when the first Flow is ready, set its root as the rootViewController of the Window

Here is how it is done in the demo app.

```swift
import UIKit
import RxFlow
import RxSwift
import RxCocoa

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    let disposeBag = DisposeBag()
    var window: UIWindow?
    var coordinator = Coordinator()
    let movieService = MoviesService()
    lazy var mainFlow = {
        return MainFlow(with: self.movieService)
    }()

    func application(_ application: UIApplication,
                     didFinishWithOptions options: [UIApplicationLaunchOptionsKey: Any]?)
                     -> Bool {

        guard let window = self.window else { return false }

        Flows.whenReady(flow: mainFlow, block: { [unowned window] (root) in
            window.rootViewController = root
        })

        coordinator.coordinate(flow: mainFlow,
                               withStepper: OneStepper(withSingleStep: DemoStep.apiKey))

        return true
    }
}
```

# Bonus
There are two reactive extensions to the Coordinator: willNavigate and didNavigate. You can subscribe to them in the AppDelegate for instance.

```swift
coordinator.rx.didNavigate.subscribe(onNext: { (flow, step) in
    print ("did navigate to flow=\(flow) and step=\(step)")
}).disposed(by: self.disposeBag)
```

This will produce this kind of logs:

```
did navigate flow=RxFlowDemo.MainFlow step=apiKeyIsComplete
did navigate flow=RxFlowDemo.WishlistFlow step=movieList
did navigate flow=RxFlowDemo.WatchedFlow step=movieList
did navigate flow=RxFlowDemo.WishlistFlow step=moviePicked(23452)
did navigate flow=RxFlowDemo.WishlistFlow step=castPicked(2)
did navigate flow=RxFlowDemo.WatchedFlow step=moviePicked(55423)
did navigate flow=RxFlowDemo.WatchedFlow step=castPicked(5)
did navigate flow=RxFlowDemo.WishlistFlow step=settings
did navigate flow=RxFlowDemo.SettingsFlow step=settings
did navigate flow=RxFlowDemo.SettingsFlow step=apiKey
did navigate flow=RxFlowDemo.SettingsFlow step=about
did navigate flow=RxFlowDemo.SettingsFlow step=apiKey
did navigate flow=RxFlowDemo.SettingsFlow step=settingsDone
```

It can be very helpful for analytics and debug purposes.

I hope you will find this Reactive Flow Coordinator pattern interesting and useful. Please, feel free to contribute and challenge my work: 
[RxFlow on GitHub](https://github.com/RxSwiftCommunity/RxFlow).

The third and last post about RxFlow will be about the tips and tricks I used to implement all the reactive mechanisms.

Stay tuned.
