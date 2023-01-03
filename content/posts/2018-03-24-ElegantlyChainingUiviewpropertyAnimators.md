---
title: Elegantly chaining UIViewPropertyAnimators
date: 2018-03-24
description: Usually my posts are mostly about design patterns, software architectures (or RxFlow 😀), but this time it will be different and frankly I didn't think I would write about this kind of topic. But I think I have something cool to share - so today we are going to talk about Animations with Swift.
tags: uikit, reactive programming
image: images/2018-03-24-ElegantlyChainingUiviewpropertyAnimators/Animator_blog.png
---

Usually my posts are mostly about design patterns, software architectures (or RxFlow 😀), but this time it will be different and frankly I didn’t think I would write about this kind of topic. But I think I have something cool to share: so today we are going to talk about Animations with Swift.

I am not a UI/UX expert, so we are not going to dive into iOS animation frameworks, but lately I had a challenge to address at work. A colleague of mine came with this issue: “Guys, in our application we have some animations played in sequence and the way we do it is pretty ugly. Is there a better way ?”.

# UIView.animate()
The ugliness he was referring to is the way we traditionally chain animations with UIKit. To illustrate my point, let’s consider this sequence:

![](/images/2018-03-24-ElegantlyChainingUiviewpropertyAnimators/animator-4.gif)

Before iOS 10, one could have coded this sequence this way:

```swift
/// on the "Play animation" click

UIView.animate(withDuration: 1, animations: { [unowned self] in
    self.box1.transform = CGAffineTransform(translationX: 0,
                                            y: -100)
}) { (completed) in
    if completed {
        UIView.animate(withDuration: 1, animations: { [unowned self] in
            self.box2.transform = CGAffineTransform(translationX: 0,
                                                    y: -100)
        }) { (completed) in
            if completed {
                UIView.animate(withDuration: 1, animations: { [unowned self] in
                    self.box3.transform = CGAffineTransform(translationX: 0,
                                                            y: -100)
                }) { (completed) in
                    if completed {
                        UIView.animate(withDuration: 1, animations: { [unowned self] in
                            self.box1.transform = CGAffineTransform(translationX: -100,
                                                                    y: -100)
                            self.box3.transform = CGAffineTransform(translationX: 100,
                                                                    y: -100)
                        }) { (completed) in
                            if completed {
                                print ("Animations are over")
                            }
                        }
                    }
                }
            }
        }
    }
}
```

UIView.animate() provides a completion block we can use to trigger the next animation. Doing so, we can create a chain of animations. As you can see, the main drawback of this technic is the ugliness of the code. It is barely readable.

# UIViewPropertyAnimator

Hopefully iOS 10 has introduced **UIViewPropertyAnimator**. I am not going to describe all the features it offers, there is a nice introduction here: [useyourloaf](https://useyourloaf.com/blog/quick-guide-to-property-animators/).

What I'm concerned about is how to improve the readability of the chaining mechanism. First thing first, UIViewPropertyAnimator natively enhance the completion technic.

The previous code snippet would become:

```swift
/// initialize UIViewPropertyAnimator lazily

lazy var animator1 = {
    UIViewPropertyAnimator(duration: 1, curve: .linear) { [unowned self] in
        self.box1.transform = CGAffineTransform(translationX: 0, y: -100)
    }
}()

lazy var animator2 = {
    UIViewPropertyAnimator(duration: 1, curve: .linear) { [unowned self] in
        self.box2.transform = CGAffineTransform(translationX: 0, y: -100)
    }
}()

lazy var animator3 = {
    UIViewPropertyAnimator(duration: 1, curve: .linear) { [unowned self] in
        self.box3.transform = CGAffineTransform(translationX: 0, y: -100)
    }
}()

lazy var animator4 = {
    UIViewPropertyAnimator(duration: 1, curve: .linear) { [unowned self] in
        self.box1.transform = CGAffineTransform(translationX: -100, y: -100)
        self.box3.transform = CGAffineTransform(translationX: 100, y: -100)
    }
}()

...

/// connect animations together

self.animator1.addCompletion { [unowned self] _ in
    self.animator2.startAnimation()
}

self.animator2.addCompletion { [unowned self] _ in
    self.animator3.startAnimation()
}

self.animator3.addCompletion { [unowned self] _ in
    self.animator4.startAnimation()
}

...

/// on the "Play animation" click

self.animator1.startAnimation()
```

It allows to clearly separate the definition of each animation from the way they are connected together.

Not only have we a far better readability but also a better decoupling. We could imagine chaining animations differently according to some context. Pretty neat.

But there is one more thing …

# Reactive animation chaining

I am a big fan of Reactive programming and the first thing that came to my mind was: Is there a way to make **UIViewPropertyAnimation** RxSwift compliant ?

What do we want to be aware of in a Reactive way ? pretty easy: the end of an animation, so we can trigger the next one.

Traditionally with RxSwift, making something compliant with reactive programming consists of adding an extension to the Reactive struct. That sounds like a good start.

We have to figure out what kind of extension we need and what should be the return type of this extension ?

The extension will somehow have to wrap the "**startAnimation**" and "**addCompletion**" mechanisms of UIViewPropertyAnimator. It will have to return some kind of **Observable** as well. But for the sake of simplicity, we will assume that an animation can only "**complete**", there is no "**stream**" management (such as **onNext**, **onSubscribed**, **onDisposed** and so on). This assumption has a nice consequence on our implementation. Our Reactive extension won't return an **Observable** but a **Completable** which is a **Trait** that implies the Observable can only be **Completed** (or failed).

Without further ado, let's see this extension:

```swift
extension Reactive where Base == UIViewPropertyAnimator {

    var animate: Completable {
        return Completable.create(subscribe: { (completable) -> Disposable in

            self.base.addCompletion({ (position) in
                if position == .end {
                    completable(.completed)
                }
            })

            self.base.startAnimation()

            return Disposables.create {
                self.base.stopAnimation(true)
            }
        })
    }
}

extension UIViewPropertyAnimator {
    var rx: Reactive<UIViewPropertyAnimator> {
        return Reactive<UIViewPropertyAnimator>(self)
    }
}
```

Basically the "**animate**" extension returns a **Completable** which, when being subscribed to, will start the animation and add a completion block that sends a "**.****completed**" event to the returned&nbsp;**Completable**.

The purpose is very simple: to be triggered when an animation is finished, so the next one can start.

The awesome thing with **Completables** is the ability to chain them with the very nice syntactic sugar expression "**andThen**".

Let's see that in action:

```swift
self.animator1.rx.animate
    .andThen(self.animator2.rx.animate)
    .andThen(self.animator3.rx.animate)
    .andThen(self.animator4.rx.animate)
    .subscribe()
    .disposed(by: self.disposeBag)
```

It is very easy to read and is self explanatory. The animation sequence can even vary depending on some context, and the code structure is still very clear:

```swift
var completable = self.animator1.rx.animate

if shouldAnimateBox2 {
    completable = completable.andThen(self.animator2.rx.animate)
}

completable.andThen(self.animator3.rx.animate)
    .andThen(self.animator4.rx.animate)
    .subscribe()
    .disposed(by: self.disposeBag)
```

But wait, there is one **last** thing …

# Magic animation chaining

Although reactive chaining is quite satisfying, not everyone wants to rely on RxSwift to improve their code awesomeness !

Swift has a really cool feature to shorten complex statements while magnifying their expressivity: **custom operators**.

It takes some creativity to figure out the right way of doing this. So I asked myself what would be the most appropriate syntax for other developers to understand my code just by having a glance at it. I ended up with something like that :

```
animation1 ~> animation2 ~> animation3 ~> animation4
```

&nbsp;Could it be simpler ?

Let's do this:

```swift
infix operator ~>: AdditionPrecedence

@discardableResult
func ~>(left: UIViewPropertyAnimator, right: UIViewPropertyAnimator) -> UIViewPropertyAnimator{

    left.addCompletion { (_) in
        right.startAnimation()
    }

    return right
}
```

What have we done here ?

* define a new binary operator: **~>**
* define what is the behavior of this operator when applied to two UIViewPropertyAnimators

This is just a way to connect two UIViewPropertyAnimators together and to hook the start of the second one to the end of the first one.

Using this new syntax couldn't be easier:

```swift
self.animator1 ~> self.animator2 ~> self.animator3 ~> self.animator4
self.animator1.startAnimation()
```

I am always amazed by the effectiveness Swift can bring to our coding flow. I used to be a Java guy, and believe me, having such a concise syntax is a relief.

I hope it will give you new ideas to go even further into chaining animations with Swift.

Stay tuned.
