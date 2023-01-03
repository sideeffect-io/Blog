---
title: RxFlow Part 1 - In Theory
date: 2017-11-08
description: This is a first article in a series that will be the heart of this blog for a while. I’m going to introduce RxFlow - a framework of my design implementing Reactive Flow Coordinator within iOS applications. RxFlow relies on RxSwift and is a project supported by the RxSwiftCommunity.
tags: open source, reactive programming
image: i/2017-11-08-RxFlow-Part1/RxFlow_Logo.png
---

This is a first article in a series that will be the heart of this blog for a while. I’m going to introduce **RxFlow**: a framework of my design implementing Reactive Flow Coordinator within iOS applications. **RxFlow** is a project supported by the [RxSwiftCommunity](https://github.com/RxSwiftCommunity).

# The facts

Regarding navigation within an iOS application, two choices are available:

* Use the builtin mechanism provided by Apple and Xcode: storyboard and segues
* Implement a custom mechanism directly in the code

The disadvantage of these two solutions:

* Builtin mechanism: navigation is relatively static and the storyboards are massive. The navigation code pollutes the UIViewControllers
* Custom mechanism: code can be difficult to set up and can be complex depending on the chosen design pattern (Router, Coordinator)

# The aim

**RxFlow** aims to:

* Promote the cutting of storyboards into atomic units to enable collaboration and reusability of UIViewControllers
* Allow the presentation of a UIViewController in different ways according to the navigation context
* Ease the implementation of dependency injection
* Remove any navigation mechanism from UIViewControllers
* Promote reactive programing
* Express the navigation in a declarative way while addressing the majority of the navigation cases
* Facilitate the cutting of an application into logical blocks of navigation

# From Storyboard to Coordinator pattern

As my experience grew as an iOS developper (as well as an Android or a Web app developer), I constantly faced the same doubts regarding navigation. For all other conception issues, there were plenty of patterns to address common architecture questions and separation of concerns needs (MVC, MVP, MVVM, VIPER, …).

But I was torn appart as soon as navigation was to be designed:

* How do I use dependency injection with Storyboards/Segues ?
* How do I control the flow of the application ?
* How do I get rid of the navigation boilerplate code from the UIViewControllers ?

As time went by, my conception of an iOS application went from MVC with one Storyboard, to MVC with multiple Storyboards, to finally reach what we could name one of the nowadays best practices: MVVM with **Flow Coordinator**. Which is perfectly fine because we can play with dependency injection, UIViewControllers reusibility, testability. I had the chance to apply this pattern to huge and complex applications in production. But in the end, there were still a couple of issues that bothered me:

* I always had to write the Coordinator pattern, again and again,
* there were a lot of delegation patterns used to allow ViewModels to communicate back with Coordinators.
* I began to look at the Redux pattern, especially the navigation state mechanism. We could have a global navigation state, exposed with a RxSwift Observables, and something listening to this state and driving the navigation. The only thing that I found disturbing was the uniqueness of this navigation state, and the uncontroled responsabilities it could have (as well as the massive data it could store)

The idea that the navigation was only the reflexion of a state that could be modified step by step begun to emerge. A state that would be spread within the whole application structure, not stored in a single place, but unified by an observer that could react to it and drive the navigation as a consequence. Later in this article, these little states spreaded in the application are called the **Steps** and the observer is called the **Coordinator**.

**RxFlow**&nbsp;is born from all that experience and addressed the two mains concerns that remained from the traditional; Coordinator pattern:

* the developper must no more write Coordinators, he only has to declare the navigation and the states it react to,
* delegation is not needed anymore, since states are RxSwift Observable observed by the FlowCoordinator

# The key principles

To learn more about Coordinator pattern, I suggest you take a look at this article: [Coordinator Redux](http://khanlou.com/2015/10/coordinators-redux/).

Although this a very good architecture, the **Coordinator** pattern has some drawbacks:

* you have to write the coordination mechanism each time you bootstrap an application
* there can be a lot of boilerplate code because of the delegation pattern that allows to communicate with Coordinators

RxFlow is a reactive implementation of the Coordinator pattern. It has all the great features of this architecture, but introduces some improvements:

* makes the navigation more declarative
* provides a built-in Coordinator that handles the navigation flows you've declared
* uses reactive programming to address the communication with Coordinators issue

There are 6 terms you have to be familiar with to understand RxFlow:

* **Flow**: each Flow defines a navigation area within your application. This is the place where you declare the navigation actions (such as presenting a UIViewController or another Flow)
* **Step**: each Step is a navigation state in your application. Combinaisons of Flows and Steps describe all the possible navigation actions. A Step can even embed inner values (such as Ids, URLs, …) that will be propagated to screens declared in the Flows
* **Stepper**: it can be anything that can emit Steps. Steppers will be responsible for triggering every navigation actions within the Flows
* **Presentable**: it is an abstraction of something that can be presented (basically UIViewController and Flow are Presentable). Presentables offer Reactive observables that the Coordinator will subscribe to in order to handle Flow Steps in a UIKit compliant way
* **Flowable**: it is a simple data structure that combines a Presentable and a stepper. It tells the Coordinator what will be the next thing that will produce new Steps in your Reactive mechanism
* **Coordinator**: once the developer has defined the suitable combinations of Flows and Steps representing the navigation possibilities, the job of the Coordinator is to mix these combinaisons in a consistent way.

This first article just addresses the conceptual and theoretical aspect of this framework. The following articles will talk about **RxFlow**&nbsp;from a more technical point of view with code samples.

You can already browse the GitHub repo of **RxFlow**, it includes a demo application:&nbsp;[https://github.com/RxSwiftCommunity/RxFlow](https://github.com/RxSwiftCommunity/RxFlow).

Stay tuned.
